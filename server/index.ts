// server/index.ts — Express server for Atlas dashboard

import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getState, setState } from './state.js';
import { runAgent } from './agents.js';
import { adlerProactiveCheck, generateBriefing } from './adler.js';
import { getAuthUrl, exchangeCode, syncMail, syncCalendar, isAuthenticated } from './outlook.js';
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

app.post('/api/ask', async (req: Request, res: Response) => {
  const { message, agentHint, state: clientState } = req.body;
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  // Merge client state if provided
  if (clientState) {
    setState(clientState);
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

// Generate briefing on startup
generateBriefing().catch(() => {});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Atlas API running on http://localhost:${PORT}`);
});
