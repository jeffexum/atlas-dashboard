// server/index.ts — Express server for Atlas dashboard

import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getState, setState } from './state.js';
import { runAgent } from './agents.js';
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

// ── Scheduled tasks ──────────────────────────────────────────────────────────

setInterval(() => {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // Morning briefing at 7:00am
  if (hour === 7 && minute === 0 && bot) {
    activeChatIds.forEach((chatId) => sendMorningBriefing(bot!, chatId));
  }

  // Habit reminder at 8:00pm
  if (hour === 20 && minute === 0 && bot) {
    activeChatIds.forEach((chatId) => sendHabitReminder(bot!, chatId));
  }
}, 60_000);

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Atlas API running on http://localhost:${PORT}`);
});
