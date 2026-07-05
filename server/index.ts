// server/index.ts — Express server for Atlas dashboard

import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getState, setState, persistNow, addHabit, deleteHabit, toggleHabitToday, recomputeAllHabits, dismissComm, snoozeComm, addShoppingItem, toggleShoppingItem, deleteShoppingItem, clearBoughtShoppingItems } from './state.js';
import { runAgent } from './agents.js';
import { adlerProactiveCheck, generateBriefing, runPartnerAdler } from './adler.js';
import { getAuthUrl, exchangeCode, syncMail, syncCalendar, isAuthenticated, loadOutlookToken, learnUserProfile, sendEmail, replyToEmail, fetchEmailBody } from './outlook.js';
import { getGoogleAuthUrl, exchangeGoogleCode, syncGoogleCalendar, isGoogleAuthenticated, loadGoogleToken } from './google.js';
import { syncOura, isOuraConfigured } from './oura.js';
import { chat, extractAndApply, saveSession, getSessions } from './whiteboard.js';
import { createCritical } from './models.js';
import type { ChatMessage } from './whiteboard.js';
import { createTelegramBot, activeChatIds, sendMorningBriefing, sendHabitReminder } from './telegram.js';

const app = express();
const BOOTED_AT = new Date().toISOString();
const PORT = parseInt(process.env.PORT || '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json({ limit: '2mb' }));

// ── API auth ──────────────────────────────────────────────────────────────────
// Set ATLAS_SECRET to require a bearer token on all API routes. Disabled when
// unset (backwards compatible). Exemptions: OAuth redirects/callbacks (browser
// navigations can't send headers) and the Telegram webhook (validated by path).
const ATLAS_SECRET = process.env.ATLAS_SECRET;
const AUTH_EXEMPT = new Set([
  '/api/outlook/auth', '/api/outlook/callback',
  '/api/google/auth', '/api/google/callback',
]);

app.use((req: Request, res: Response, next) => {
  if (!ATLAS_SECRET) { next(); return; }
  if (req.path.startsWith('/webhook')) { next(); return; }
  if (AUTH_EXEMPT.has(req.path)) { next(); return; }
  const header = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const key = header || (req.query.key as string | undefined); // ?key= for EventSource
  if (key === ATLAS_SECRET) { next(); return; }
  res.status(401).json({ error: 'unauthorized' });
});

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

// ── Habits ────────────────────────────────────────────────────────────────────

app.post('/api/habits', async (req: Request, res: Response) => {
  const { name, cadence } = req.body as { name: string; cadence?: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }
  const habit = addHabit(name.trim(), cadence || 'Daily');
  await persistNow();
  res.json({ ok: true, habit });
});

app.post('/api/habits/:id/toggle', async (req: Request, res: Response) => {
  toggleHabitToday(req.params.id as string);
  await persistNow();
  res.json({ ok: true });
});

app.delete('/api/habits/:id', async (req: Request, res: Response) => {
  deleteHabit(req.params.id as string);
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

app.post('/api/comms/:id/dismiss', async (req: Request, res: Response) => {
  dismissComm(req.params.id as string);
  await persistNow();
  res.json({ ok: true });
});

app.post('/api/comms/:id/snooze', async (req: Request, res: Response) => {
  snoozeComm(req.params.id as string);
  await persistNow();
  res.json({ ok: true });
});

app.get('/api/comms/:id/body', async (req: Request, res: Response) => {
  if (!isAuthenticated()) { res.status(401).json({ error: 'Not authenticated' }); return; }
  try {
    const body = await fetchEmailBody(req.params.id as string);
    res.json({ body });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
    // Refresh the daily briefing against the new data (non-blocking)
    generateBriefing().catch(() => {});
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
    // Drafts linked to an inbox email send as in-thread replies, not new threads
    if (draft.commId) {
      await replyToEmail(draft.commId, draft.text);
    } else {
      await sendEmail(draft.to, draft.re, draft.text);
    }
    setState({ drafts: s.drafts.map((d) => d.id === draftId ? { ...d, status: 'sent' as const } : d) });
    await persistNow();
    res.json({ ok: true });
  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Persist manual edits to a draft
app.patch('/api/drafts/:id', async (req: Request, res: Response) => {
  const { text } = req.body as { text: string };
  const s = getState();
  if (!s.drafts.some((d) => d.id === req.params.id)) { res.status(404).json({ error: 'draft not found' }); return; }
  setState({ drafts: s.drafts.map((d) => d.id === req.params.id ? { ...d, text } : d) });
  await persistNow();
  res.json({ ok: true });
});

// Adler revises a draft per instruction, with the original email as context
app.post('/api/drafts/:id/refine', async (req: Request, res: Response) => {
  const { instruction } = req.body as { instruction: string };
  if (!instruction?.trim()) { res.status(400).json({ error: 'instruction required' }); return; }
  const s = getState();
  const draft = s.drafts.find((d) => d.id === req.params.id);
  if (!draft) { res.status(404).json({ error: 'draft not found' }); return; }
  const comm = draft.commId ? s.comms.find((c) => c.id === draft.commId) : undefined;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' }); return; }
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const prompt = `You are revising an email draft written on behalf of Jeff Williams, CEO of Exum Instruments.${s.userProfile ? `\n\nJEFF'S STYLE PROFILE:\n${s.userProfile.slice(0, 3000)}` : ''}
${comm ? `\nORIGINAL EMAIL BEING REPLIED TO (from ${comm.who}, "${comm.subject}"):\n${(comm.body || comm.preview).slice(0, 3000)}\n` : ''}
CURRENT DRAFT:
${draft.text}

JEFF'S REVISION INSTRUCTION:
${instruction}

Rewrite the draft applying the instruction while keeping Jeff's voice. Keep the format: greeting line, blank line, short body, blank line, "Cheers,\nJeff". Return ONLY the revised reply text.`;

  try {
    const response = await createCritical(client, {
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock?.type === 'text' ? textBlock.text.trim() : draft.text;
    setState({ drafts: getState().drafts.map((d) => d.id === draft.id ? { ...d, text } : d) });
    await persistNow();
    res.json({ ok: true, text });
  } catch (err) {
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

${(comm.body || comm.preview).slice(0, 4000)}

Write a reply that matches Jeff's communication and management style from the profile exactly — short, casual, direct. 1-4 sentences maximum unless the email genuinely requires more.

FORMAT (exactly this structure, with blank lines between parts):
Greeting line (e.g. "Hi Mike," or just the first name)

Body — one or two short paragraphs

Cheers,
Jeff

No subject line. Return only the reply text.`;

  const response = await createCritical(client, {
    max_tokens: 1024,
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
    commId: comm.id, // send as in-thread reply
  };

  setState({ drafts: [...s.drafts, draft] });
  await persistNow();
  res.json({ ok: true, draft });
});

// ── Google Calendar ───────────────────────────────────────────────────────────

app.get('/api/google/auth', (_req: Request, res: Response) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: 'Google integration not configured' });
    return;
  }
  res.redirect(getGoogleAuthUrl());
});

app.get('/api/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) { res.status(400).send('Missing authorization code'); return; }
  try {
    await exchangeGoogleCode(code);
    await syncGoogleCalendar();
    res.redirect(`${FRONTEND_URL}?google=connected`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.status(500).send('Google OAuth failed: ' + (err as Error).message);
  }
});

app.get('/api/google/sync', async (_req: Request, res: Response) => {
  if (!isGoogleAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated', authUrl: '/api/google/auth' });
    return;
  }
  try {
    await syncGoogleCalendar();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/google/status', (_req: Request, res: Response) => {
  res.json({ authenticated: isGoogleAuthenticated() });
});

// ── Shopping list ─────────────────────────────────────────────────────────────

app.post('/api/shopping', async (req: Request, res: Response) => {
  const { name, category, addedBy } = req.body as { name: string; category?: string; addedBy?: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }
  const cat = (['Groceries', 'House', 'Misc'].includes(category || '') ? category : 'Misc') as 'Groceries' | 'House' | 'Misc';
  const item = addShoppingItem(name.trim(), cat, addedBy || 'Jeff');
  await persistNow();
  res.json({ ok: true, item });
});

app.post('/api/shopping/:id/toggle', async (req: Request, res: Response) => {
  toggleShoppingItem(req.params.id as string);
  await persistNow();
  res.json({ ok: true });
});

app.delete('/api/shopping/:id', async (req: Request, res: Response) => {
  deleteShoppingItem(req.params.id as string);
  await persistNow();
  res.json({ ok: true });
});

app.post('/api/shopping/clear-bought', async (_req: Request, res: Response) => {
  clearBoughtShoppingItems();
  await persistNow();
  res.json({ ok: true });
});

// ── Sync everything ───────────────────────────────────────────────────────────

app.post('/api/sync/all', async (_req: Request, res: Response) => {
  const results: Record<string, string> = {};
  if (isAuthenticated()) {
    try { await syncMail(); await syncCalendar(); results.outlook = 'ok'; }
    catch (err) { results.outlook = (err as Error).message; }
  } else results.outlook = 'not connected';
  if (isGoogleAuthenticated()) {
    try { await syncGoogleCalendar(); results.google = 'ok'; }
    catch (err) { results.google = (err as Error).message; }
  } else results.google = 'not connected';
  if (isOuraConfigured()) {
    try { await syncOura(); results.oura = 'ok'; }
    catch (err) { results.oura = (err as Error).message; }
  } else results.oura = 'not configured';
  await persistNow();
  res.json(results);
  generateBriefing().catch(() => {});
});

// ── Oura Ring ─────────────────────────────────────────────────────────────────

app.get('/api/oura/status', (_req: Request, res: Response) => {
  res.json({ configured: isOuraConfigured() });
});

app.get('/api/oura/sync', async (_req: Request, res: Response) => {
  if (!isOuraConfigured()) { res.status(503).json({ error: 'OURA_TOKEN not configured' }); return; }
  try {
    await syncOura();
    await persistNow();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Whiteboard ────────────────────────────────────────────────────────────────

app.post('/api/whiteboard/chat', async (req: Request, res: Response) => {
  const { history, sessionId, sessionTitle } = req.body as {
    history: ChatMessage[];
    sessionId: string;
    sessionTitle?: string;
  };
  if (!history?.length) { res.status(400).json({ error: 'history required' }); return; }
  try {
    const text = await chat(history);
    // Save session to Redis
    await saveSession({
      id: sessionId,
      title: sessionTitle || history[0]?.text?.slice(0, 60) || 'Whiteboard session',
      startedAt: Date.now(),
      messages: history.map((m) => ({ role: m.role, text: m.text })).concat([{ role: 'assistant', text }]),
    });
    res.json({ text });
  } catch (err) {
    console.error('Whiteboard chat error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/whiteboard/extract', async (req: Request, res: Response) => {
  const { history } = req.body as { history: ChatMessage[] };
  if (!history?.length) { res.status(400).json({ error: 'history required' }); return; }
  try {
    const result = await extractAndApply(history);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Whiteboard extract error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/whiteboard/sessions', async (_req: Request, res: Response) => {
  try {
    const sessions = await getSessions();
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/debug/partner-chat', async (req: Request, res: Response) => {
  const { message, name } = req.body as { message: string; name?: string };
  if (!message) { res.status(400).json({ error: 'message required' }); return; }
  try {
    const text = await runPartnerAdler(message, name || 'Lacy');
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/debug/version', (_req: Request, res: Response) => {
  res.json({ commit: process.env.RENDER_GIT_COMMIT || 'unknown', bootedAt: BOOTED_AT });
});

app.get('/api/debug/persist', async (_req: Request, res: Response) => {
  const results = await persistNow();
  res.json(results);
});

app.get('/api/debug/comms', (_req: Request, res: Response) => {
  const s = getState();
  res.json(s.comms.map((c) => ({
    who: c.who,
    subject: c.subject,
    hasBody: !!((c as typeof c & { body?: string }).body),
    bodyLen: ((c as typeof c & { body?: string }).body || '').length,
    previewLen: c.preview.length,
  })));
});

// One-shot scrub of demo/seed data (short sequential ids like d1, a3, h2, g4, b7, i5, j1, hl2)
app.post('/api/admin/scrub-seed', async (_req: Request, res: Response) => {
  const seedId = /^(d|a|h|g|b|i|j|hl|t)\d{1,2}$/;
  const s = getState();
  const before = {
    drafts: s.drafts.length, proposedActions: s.proposedActions.length, habits: s.habits.length,
    goals: s.goals.length, books: s.books.length, highlights: s.highlights.length,
    ideas: s.ideas.length, journalEntries: s.journalEntries.length, tasks: s.tasks.length,
  };
  setState({
    drafts: s.drafts.filter((x) => !seedId.test(x.id)),
    proposedActions: s.proposedActions.filter((x) => !seedId.test(x.id)),
    habits: s.habits.filter((x) => !seedId.test(x.id)),
    goals: s.goals.filter((x) => !seedId.test(x.id)),
    books: s.books.filter((x) => !seedId.test(x.id)),
    highlights: s.highlights.filter((x) => !seedId.test(x.id)),
    ideas: s.ideas.filter((x) => !seedId.test(x.id)),
    journalEntries: s.journalEntries.filter((x) => !seedId.test(x.id)),
    tasks: s.tasks.filter((x) => !seedId.test(x.id)),
  });
  await persistNow();
  const after = getState();
  res.json({
    removed: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v - (after[k as keyof typeof before] as unknown[]).length])),
  });
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

// Hourly: refresh habit derived fields so day rollover resets "done today" and streaks
setInterval(() => recomputeAllHabits(), 60 * 60_000);

// ── Morning briefing at 7am ───────────────────────────────────────────────────

setInterval(() => {
  const now = new Date();
  const denverHour = parseInt(now.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Denver' }), 10);
  if (denverHour === 7 && now.getMinutes() === 0) {
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
  .then(() => recomputeAllHabits())
  .then(() => loadOutlookToken())
  .then(() => loadGoogleToken())
  .then(() => {
    // Learn Jeff's email style once if we've never done it
    if (isAuthenticated() && !getState().userProfile) {
      learnUserProfile()
        .then(() => persistNow())
        .then(() => console.log('User style profile learned at boot'))
        .catch((err) => console.warn('Boot profile learn failed:', (err as Error).message));
    }
  })
  .then(() => { if (isOuraConfigured()) return syncOura().catch((e) => console.warn('Oura boot sync failed:', (e as Error).message)); })
  .then(() => generateBriefing())
  .catch(() => {});

// Oura re-sync every 2 hours (new sleep data lands once a day, but readiness/activity update)
setInterval(() => {
  if (isOuraConfigured()) syncOura().catch(() => {});
}, 2 * 60 * 60_000);

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
