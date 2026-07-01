// server/telegram.ts — Telegram bot in webhook mode

import TelegramBot from 'node-telegram-bot-api';
import { runAgent } from './agents.js';
import { runAdler } from './adler.js';
import { getState } from './state.js';

export const activeChatIds = new Set<number>();

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

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    activeChatIds.add(chatId);

    if (text === '/start') {
      await bot.sendMessage(
        chatId,
        `👋 *Welcome to Atlas!*\n\nCommands:\n/tasks — Today's tasks\n/inbox — Inbox summary\n/habits — Habit streaks\n/goals — Goal progress\n/briefing — Full morning briefing\n/adler — Talk to your personal coach\n\nOr just type anything. Say "Adler, ..." to reach your coach directly.`,
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
      await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
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
  const nextEvent = s.calEvents.filter((e) => e.date === 29).sort((a, b) => a.start - b.start)[0];

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
