// server/telegram.ts — Telegram bot in webhook mode

import TelegramBot from 'node-telegram-bot-api';
import { runAgent } from './agents.js';
import { runAdler, runPartnerAdler } from './adler.js';
import { getState } from './state.js';

export const activeChatIds = new Set<number>();

// ── Telegram user roles (persisted to Redis) ─────────────────────────────────
// owner = Jeff (full Adler). partner = trusted person with a scoped assistant.
// Unknown chat ids get nothing until the owner approves them.

interface TgUser { role: 'owner' | 'partner'; name: string }
let tgUsers: Record<string, TgUser> = {};

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;
const TG_USERS_KEY = 'atlas:telegramUsers';

async function loadTgUsers(): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    const res = await fetch(`${REDIS_URL}/get/${TG_USERS_KEY}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const json = await res.json() as { result: string | null };
    if (json.result) {
      let parsed: unknown = JSON.parse(json.result);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      tgUsers = (parsed as Record<string, TgUser>) || {};
    }
  } catch { /* ignore */ }
}

async function saveTgUsers(): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  await fetch(`${REDIS_URL}/set/${TG_USERS_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(tgUsers),
  }).catch(() => {});
}

export function ownerChatIds(): number[] {
  return Object.entries(tgUsers).filter(([, u]) => u.role === 'owner').map(([id]) => Number(id));
}

// Telegram Markdown rejects unescaped _ * [ etc. — fall back to plain text rather than dropping the message
async function sendSafe(bot: TelegramBot, chatId: number, text: string): Promise<void> {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch {
    await bot.sendMessage(chatId, text);
  }
}

const AGENT_EMOJIS: Record<string, string> = {
  planner: '📅',
  coach: '💪',
  scout: '📚',
  keeper: '🔔',
};

export function createTelegramBot(webhookUrl: string): TelegramBot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
    // Return a dummy bot that won't crash
    return new TelegramBot('placeholder', { polling: false });
  }

  const bot = new TelegramBot(token, { webHook: { port: 0 } });
  loadTgUsers();

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    // ── Role resolution ──
    // Bootstrap: the very first chat ever seen becomes the owner (Jeff).
    if (Object.keys(tgUsers).length === 0) {
      tgUsers[String(chatId)] = { role: 'owner', name: 'Jeff' };
      await saveTgUsers();
    }
    const user = tgUsers[String(chatId)];

    // Unknown person — no access until Jeff approves
    if (!user) {
      await bot.sendMessage(
        chatId,
        `This is a private assistant. Ask Jeff to approve you — he needs to send:\n\n/approve ${chatId} YourName`
      );
      return;
    }

    // Owner-only: approve/remove partners
    if (user.role === 'owner' && text.startsWith('/approve ')) {
      const [, id, ...nameParts] = text.split(' ');
      const name = nameParts.join(' ').trim() || 'Partner';
      if (!id || !/^-?\d+$/.test(id)) {
        await bot.sendMessage(chatId, 'Usage: /approve <chatId> <name>');
        return;
      }
      tgUsers[id] = { role: 'partner', name };
      await saveTgUsers();
      await bot.sendMessage(chatId, `✅ ${name} approved. They can now talk to their own scoped Adler — schedule, tasks, habits, notes. No email access.`);
      bot.sendMessage(Number(id), `🎉 Jeff approved you! I'm Adler, Jeff's assistant. You can ask me about his day or schedule, add things to his to-do list or calendar, or leave him a note. What can I do for you, ${name}?`).catch(() => {});
      return;
    }
    if (user.role === 'owner' && text === '/users') {
      const lines = Object.entries(tgUsers).map(([id, u]) => `${u.name} (${u.role}) — ${id}`);
      await bot.sendMessage(chatId, `Registered users:\n${lines.join('\n')}`);
      return;
    }

    // ── Partner path: scoped assistant, no commands ──
    if (user.role === 'partner') {
      try {
        await bot.sendChatAction(chatId, 'typing');
        const reply = await runPartnerAdler(text, user.name);
        await sendSafe(bot, chatId, reply);
      } catch (err) {
        console.error('Partner Adler error:', err);
        await bot.sendMessage(chatId, 'Something went wrong — try again in a moment.');
      }
      return;
    }

    // ── Owner path (Jeff) ──
    activeChatIds.add(chatId);

    if (text === '/start') {
      await bot.sendMessage(
        chatId,
        `👋 *Welcome to Atlas!*\n\nCommands:\n/tasks — Today's tasks\n/inbox — Inbox summary\n/habits — Habit streaks\n/goals — Goal progress\n/briefing — Full morning briefing\n/approve <chatId> <name> — Give a partner scoped access\n/users — List who has access\n\nOr just type anything — Adler handles it.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (text === '/tasks') {
      const s = getState();
      const todayTasks = s.tasks.filter((t) => t.column === 'today');
      const lines = todayTasks.map((t) => {
        const done = t.done ? '✅' : t.priority === 'p1' ? '🔴' : t.priority === 'p2' ? '🟡' : '⚪';
        return `${done} ${t.title}`;
      });
      await bot.sendMessage(chatId, `📋 *Today's Tasks*\n\n${lines.join('\n') || 'No tasks today!'}`, { parse_mode: 'Markdown' });
      return;
    }

    if (text === '/inbox') {
      const s = getState();
      const open = s.comms.filter((c) => c.status === 'open');
      const p1 = open.filter((c) => c.priority === 'p1');
      const lines = open.slice(0, 5).map((c) => {
        const icon = c.priority === 'p1' ? '🔴' : c.priority === 'p2' ? '🟡' : '⚪';
        return `${icon} *${c.who}*: ${c.subject}`;
      });
      await bot.sendMessage(
        chatId,
        `📬 *Inbox* — ${open.length} open (${p1.length} urgent)\n\n${lines.join('\n')}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (text === '/habits') {
      const s = getState();
      const lines = s.habits.map((h) => {
        const done = h.completedToday ? '✅' : '⬜';
        return `${done} ${h.name} — ${h.streak}🔥 streak`;
      });
      await bot.sendMessage(chatId, `💪 *Habits*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
      return;
    }

    if (text === '/goals') {
      const s = getState();
      const lines = s.goals.map((g) => {
        const bar = '█'.repeat(Math.round(g.pct / 10)) + '░'.repeat(10 - Math.round(g.pct / 10));
        return `*${g.name}*\n${bar} ${g.pct}%`;
      });
      await bot.sendMessage(chatId, `🎯 *Goals*\n\n${lines.join('\n\n')}`, { parse_mode: 'Markdown' });
      return;
    }

    if (text === '/briefing') {
      await sendMorningBriefing(bot, chatId);
      return;
    }

    // All free-text goes to Adler — he's the primary interface
    try {
      await bot.sendChatAction(chatId, 'typing');
      const reply = await runAdler(text);
      await sendSafe(bot, chatId, reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Adler error:', err);
      await bot.sendMessage(chatId, `Error: ${msg}`);
    }
  });

  return bot;
}

export async function sendMorningBriefing(bot: TelegramBot, chatId: number): Promise<void> {
  const s = getState();
  const todayTasks = s.tasks.filter((t) => t.column === 'today');
  const p1Tasks = todayTasks.filter((t) => t.priority === 'p1');
  const openComms = s.comms.filter((c) => c.status === 'open');
  const habitsLogged = s.habits.filter((h) => h.completedToday).length;
  const today = new Date().getDate();
  const nowHour = new Date().getHours();
  const nextEvent = s.calEvents
    .filter((e) => e.date === today && e.start >= nowHour)
    .sort((a, b) => a.start - b.start)[0];

  const lines = [
    `☀️ *Good morning, Jeff!* Here's your briefing for today:`,
    ``,
    `📋 *Tasks:* ${todayTasks.length} today, ${p1Tasks.length} urgent`,
    p1Tasks.length > 0 ? p1Tasks.map((t) => `  🔴 ${t.title}`).join('\n') : '',
    ``,
    `📬 *Inbox:* ${openComms.length} messages`,
    ``,
    `💪 *Habits:* ${habitsLogged}/${s.habits.length} logged`,
    ``,
    nextEvent ? `📅 *Next:* ${nextEvent.title} at ${nextEvent.start}:00` : '',
    ``,
    `Have a great day! 🚀`,
  ].filter((l) => l !== undefined);

  await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

export async function sendHabitReminder(bot: TelegramBot, chatId: number): Promise<void> {
  const s = getState();
  const pending = s.habits.filter((h) => !h.completedToday);
  if (pending.length === 0) {
    await bot.sendMessage(chatId, '🎉 All habits done for today! Amazing work!');
    return;
  }
  const lines = pending.map((h) => `⬜ ${h.name} (${h.streak}🔥 streak at stake!)`);
  await bot.sendMessage(
    chatId,
    `🌙 *Evening habit reminder!*\n\n${lines.join('\n')}\n\nDon't break your streaks!`,
    { parse_mode: 'Markdown' }
  );
}

export async function sendUrgentInboxAlert(bot: TelegramBot, chatId: number): Promise<void> {
  const s = getState();
  const urgent = s.comms.filter((c) => c.status === 'open' && c.priority === 'p1');
  if (urgent.length === 0) return;
  const lines = urgent.map((c) => `🔴 *${c.who}*: ${c.subject}`);
  await bot.sendMessage(
    chatId,
    `🚨 *Urgent inbox items:*\n\n${lines.join('\n')}`,
    { parse_mode: 'Markdown' }
  );
}
