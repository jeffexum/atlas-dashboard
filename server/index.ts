// server/index.ts — Express server for Atlas dashboard

import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getState, setState, persistNow } from './state.js';
import { runAgent } from './agents.js';
import { adlerProactiveCheck, generateBriefing } from './adler.js';
import { getAuthUrl, exchangeCode, syncMail, syncCalendar, isAuthenticated, loadOutlookToken, learnUserProfile, sendEmail } from './outlook.js';
import { createTelegramBot, activeChatIds, sendMorningBriefing, sendHabitReminder } from './telegram.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json({ limit: '2mb' }));

// ── SSE clients ──────────────────────────────────────────────────────────────

const sseClients = new Set<Response>();

function broadcastState() {
  const data = JSON.stringify(getState());
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`);
  }
}

// Broadcast on state changes
import { subscribe } from './state.js';
subscribe(() => broadcastState());

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/state', (_req: Request, res: Response) => {
  res.json(getState());
});

app.post('/api/state', (req: Request, res: Response) => {
  setState(req.body);
  res.json({ ok: true });
});

app.post('/api/tasks', async (req: Request, res: Response) => {
  const task = req.body;
  const s = getState();
  setState({ tasks: [...s.tasks, task] });
  await persistNow();
  res.json({ ok: true });
});

app.patch('/api/tasks/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const s = getState();
  const tasks = s.tasks.map((t) => t.id === id ? { ...t, ...req.body } : t);
  setState({ tasks });
  await persistNow();
  res.json({ ok: true });
});

app.delete('/api/tasks/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const s = getState();
  const tasks = s.tasks.filter((t) => t.id !== id);
  setState({ tasks });
  await persistNow();
  res.json({ ok: true });
});

app.post('/api/ask', async (req: Request, res: Response) => {
  const { message, agentHint } = req.body;
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  const result = await runAgent({ message, agentHint, state: getState() });
  res.json(result);
});

app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  res.write(`data: ${JSON.stringify(getState())}\n\n`);

  sseClients.add(res);

  // 30s heartbeat
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ── Briefing ──────────────────────────────────────────────────────────────────

app.post('/api/briefing/generate', async (_req: Request, res: Response) => {
  await generateBriefing();
  const s = getState();
  res.json({ briefingText: s.briefingText, briefingNudges: s.briefingNudges });
});

// ── Outlook / Microsoft Graph ─────────────────────────────────────────────────

app.get('/api/outlook/auth', (_req: Request, res: Response) => {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    res.status(503).json({ error: 'Outlook integration not configured' });
    return;
  }
  res.redirect(getAuthUrl());
});

app.get('/api/outlook/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).send('Missing authorization code');
    return;
  }
  try {
    await exchangeCode(code);
    await syncMail();
    await syncCalendar();
    res.redirect(`${FRONTEND_URL}?outlook=connected`);
  } catch (err) {
    console.error('Outlook OAuth error:', err);
    res.status(500).send('OAuth failed: ' + (err as Error).message);
  }
});

app.get('/api/outlook/sync', async (_req: Request, res: Response) => {
  if (!isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated', authUrl: '/api/outlook/auth' });
    return;
  }
  try {
    await syncMail();
    await syncCalendar();
    res.json({ ok: true });
  } catch (err) {
    console.error('Outlook sync error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/outlook/status', (_req: Request, res: Response) => {
  res.json({ authenticated: isAuthenticated() });
});

app.post('/api/drafts/send', async (req: Request, res: Response) => {
  const { draftId } = req.body as { draftId: string };
  const s = getState();
  const draft = s.drafts.find((d) => d.id === draftId);
  if (!draft) { res.status(404).json({ error: 'draft not found' }); return; }
  if (!isAuthenticated()) { res.status(401).json({ error: 'Not authenticated', authUrl: '/api/outlook/auth' }); return; }
  try {
    await sendEmail(draft.to, draft.re, draft.text);
    setState({ drafts: s.drafts.map((d) => d.id === draftId ? { ...d, status: 'sent' as const } : d) });
    await persistNow();
    res.json({ ok: true });
  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/drafts/reply', async (req: Request, res: Response) => {
  const { commId } = req.body as { commId: string };
  const s = getState();
  const comm = s.comms.find((c) => c.id === commId);
  if (!comm) { res.status(404).json({ error: 'comm not found' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' }); return; }

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const profileSection = s.userProfile
    ? `\n\nUSER PROFILE (communication style, company context):\n${s.userProfile}`
    : '';

  const prompt = `You are drafting an email reply on behalf of Jeff Williams, CEO of Exum Instruments.${profileSection}

EMAIL TO REPLY TO:
From: ${comm.who}
Subject: ${comm.subject}
Preview: ${comm.preview}

Write a reply that matches Jeff's communication style exactly — short, casual, direct, "Cheers, Jeff" sign-off. 1-4 sentences maximum. No subject line. Just the body text.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock?.type === 'text' ? textBlock.text : `Hi ${comm.who.split(' ')[0]}, thanks for reaching out. Cheers, Jeff`;

  const draft = {
    id: `d-${Date.now()}`,
    to: comm.who,
    re: comm.subject,
    text,
    status: 'ready' as const,
  };

  setState({ drafts: [...s.drafts, draft] });
  await persistNow();
  res.json({ ok: true, draft });
});

app.post('/api/admin/clear-cal-note', async (_req: Request, res: Response) => {
  setState({ calNote: '' });
  await persistNow();
  res.json({ ok: true });
});

app.post('/api/outlook/learn', async (_req: Request, res: Response) => {
  if (!isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated', authUrl: '/api/outlook/auth' });
    return;
  }
  try {
    const profile = await learnUserProfile();
    res.json({ ok: true, profile });
  } catch (err) {
    console.error('Profile learn error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Telegram webhook ─────────────────────────────────────────────────────────

let bot: ReturnType<typeof createTelegramBot> | null = null;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_BASE = process.env.WEBHOOK_URL || process.env.FRONTEND_URL?.replace('atlas-dashboard', 'atlas-api') || '';

if (TELEGRAM_TOKEN && WEBHOOK_BASE) {
  const webhookPath = `/webhook/telegram`;
  const webhookUrl = `${WEBHOOK_BASE}${webhookPath}`;
  bot = createTelegramBot(webhookUrl);

  app.post('/webhook/telegram', (req: Request, res: Response) => {
    bot!.processUpdate(req.body);
    res.sendStatus(200);
  });

  // Register webhook with Telegram
  async function registerWebhook() {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
      const resp = await fetch(url);
      const data = await resp.json() as { ok: boolean; description?: string };
      if (data.ok) {
        console.log(`Telegram webhook registered: ${webhookUrl}`);
      } else {
        console.warn('Telegram webhook registration failed:', data.description);
      }
    } catch (err) {
      console.warn('Could not register Telegram webhook:', err);
    }
  }

  registerWebhook();
} else {
  console.log('Telegram not configured (missing TELEGRAM_BOT_TOKEN or WEBHOOK_URL)');
}

// ── Adler proactive check (every 10 min, Adler decides whether to reach out) ─

setInterval(async () => {
  if (!bot || activeChatIds.size === 0) return;
  try {
    const message = await adlerProactiveCheck();
    if (message) {
      activeChatIds.forEach((chatId) => {
        bot!.sendMessage(chatId, `🧠 *Adler*\n\n${message}`, { parse_mode: 'Markdown' });
      });
    }
  } catch (err) {
    console.error('Adler proactive check error:', err);
  }
}, 10 * 60_000);

// ── Morning briefing at 7am ───────────────────────────────────────────────────

setInterval(() => {
  const now = new Date();
  if (now.getHours() === 7 && now.getMinutes() === 0) {
    generateBriefing();
    if (bot) activeChatIds.forEach((chatId) => sendMorningBriefing(bot!, chatId));
  }
}, 60_000);

// Load persisted state then generate briefing
import { loadPersistedState, migrateLegacyState } from './state.js';
loadPersistedState()
  .then(() => migrateLegacyState())
  .then(() => {
    // Clear corrupt calNote (accumulated JSON-encoding garbage)
    setState({ calNote: '' });
    persistNow().catch(() => {});
  })
  .then(() => loadOutlookToken())
  .then(() => generateBriefing())
  .catch(() => {});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Atlas API running on http://localhost:${PORT}`);
});

// Flush state to Redis before shutdown so in-flight changes aren't lost
async function shutdown() {
  console.log('Shutting down — flushing state to Redis...');
  await persistNow();
  console.log('State flushed. Exiting.');
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
