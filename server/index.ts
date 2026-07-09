// server/index.ts — Express server for Atlas dashboard

import 'dotenv/config';
import { trackModelCall, audit } from './audit.js';
import { USER } from './config.js';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getState, setState, persistNow, addHabit, deleteHabit, toggleHabitToday, toggleHabitDate, recomputeAllHabits, dismissComm, snoozeComm, addShoppingItem, toggleShoppingItem, deleteShoppingItem, clearBoughtShoppingItems } from './state.js';
import type { Comm } from './state.js';
import { adlerProactiveCheck, generateBriefing, runPartnerAdler, runAdler } from './adler.js';
import { getAuthUrl, exchangeCode, syncMail, syncCalendar, isAuthenticated, loadOutlookToken, learnUserProfile, sendEmail, replyToEmail, fetchEmailBody, hasCalendarWrite, syncContacts } from './outlook.js';
import { getGoogleAuthUrl, exchangeGoogleCode, syncGoogleCalendar, isGoogleAuthenticated, loadGoogleToken, hasCalendarWriteScope } from './google.js';
import { syncOura, isOuraConfigured } from './oura.js';
import { isGmailConnected, syncGmail, replyGmail, fetchGmailBody } from './gmail.js';
import { suggestSlots, guessTimezone } from './schedule.js';
import { syncGoodreads, isGoodreadsConfigured } from './goodreads.js';
import { ensureGraphSubscription, onMailNotification, GRAPH_CLIENT_STATE } from './webhooks.js';
import { addDelegation, setDelegationStatus, deleteDelegation, extractDelegations, sweepDelegationStatuses } from './delegations.js';
import { chat, extractAndApply, saveSession, getSessions } from './whiteboard.js';
import { createCritical } from './models.js';
import type { ChatMessage } from './whiteboard.js';
import { createTelegramBot, activeChatIds, ownerChatIds, sendMorningBriefing, sendHabitReminder } from './telegram.js';

const app = express();
const BOOTED_AT = new Date().toISOString();
const PORT = parseInt(process.env.PORT || '3001', 10);
const IS_PROD = process.env.NODE_ENV === 'production';
// Exact origin required (not '*') so credentialed (cookie) requests are allowed.
const FRONTEND_URL = process.env.FRONTEND_URL || (IS_PROD ? '' : '*');

app.use(cors({ origin: FRONTEND_URL || false, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// ── API auth ──────────────────────────────────────────────────────────────────
// Two accepted credentials:
//  1. Session cookie (real login) — how the browser authenticates after /api/login.
//  2. Bearer ATLAS_SECRET — for programmatic/server-to-server access (kept for
//     backward compatibility and tooling); never shipped in the frontend bundle.
// Exemptions: login/session endpoints, OAuth redirects/callbacks (browser
// navigations can't send credentials), and webhooks (validated by their own token).
import crypto from 'crypto';
import { COOKIE_NAME, verifyToken, verifyPassword, mintToken, sessionCookie, clearCookie, parseCookies, loginConfigured, LOGIN_PASSWORD } from './session.js';

const ATLAS_SECRET = process.env.ATLAS_SECRET;
const AUTH_CONFIGURED = !!(ATLAS_SECRET || loginConfigured());
const AUTH_EXEMPT = new Set([
  '/api/outlook/auth', '/api/outlook/callback',
  '/api/google/auth', '/api/google/callback',
  '/api/login', '/api/session',
]);

function bearerOk(req: Request): boolean {
  if (!ATLAS_SECRET) return false;
  const header = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const key = header || (req.path === '/api/events' ? (req.query.key as string | undefined) : undefined);
  if (!key) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(ATLAS_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cookieOk(req: Request): boolean {
  return verifyToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

app.use((req: Request, res: Response, next) => {
  if (req.path.startsWith('/webhook')) { next(); return; }
  if (AUTH_EXEMPT.has(req.path)) { next(); return; }
  // Fail CLOSED in production: if no auth mechanism is configured, refuse API access
  // rather than silently exposing everything.
  if (!AUTH_CONFIGURED) {
    if (IS_PROD) { res.status(503).json({ error: 'auth not configured — set ATLAS_PASSWORD (and SESSION_SECRET) or ATLAS_SECRET' }); return; }
    next(); return; // local dev convenience only
  }
  if (cookieOk(req) || bearerOk(req)) { next(); return; }
  res.status(401).json({ error: 'unauthorized' });
});

// ── Login / session ────────────────────────────────────────────────────────────
app.post('/api/login', (req: Request, res: Response) => {
  if (!loginConfigured()) { res.status(503).json({ error: 'login not configured' }); return; }
  const { password } = (req.body || {}) as { password?: string };
  if (!verifyPassword(password)) { res.status(401).json({ error: 'invalid password' }); return; }
  res.setHeader('Set-Cookie', sessionCookie(mintToken()));
  res.json({ ok: true });
});

app.post('/api/logout', (_req: Request, res: Response) => {
  res.setHeader('Set-Cookie', clearCookie());
  res.json({ ok: true });
});

app.get('/api/session', (req: Request, res: Response) => {
  res.json({
    authed: cookieOk(req) || bearerOk(req),
    loginConfigured: !!LOGIN_PASSWORD,
    authRequired: AUTH_CONFIGURED,
  });
});

// ── SSE clients ──────────────────────────────────────────────────────────────

const sseClients = new Set<Response>();

// Trim heavy fields the dashboard never renders (full email bodies, 200KB knowledge
// doc contents) from the pushed payload — keeps each SSE frame small. Bodies are
// fetched on demand via /api/comms/:id/body; knowledge shows as a name list.
function slimState() {
  const s = getState();
  return {
    ...s,
    comms: s.comms.map((c) => { const { body, ...rest } = c as Comm & { body?: string }; return rest; }),
    knowledge: s.knowledge.map((k) => { const { content, ...rest } = k as { content?: string }; return { ...rest, hasContent: !!content }; }),
  };
}

function broadcastState() {
  const data = JSON.stringify(slimState());
  for (const res of sseClients) {
    if (!res.write(`data: ${data}\n\n`)) {
      // Client can't keep up — drop it rather than buffer unbounded in memory.
      try { res.end(); } catch { /* already closing */ }
      sseClients.delete(res);
    }
  }
}

// Broadcast on state changes
import { subscribe } from './state.js';
subscribe(() => broadcastState());

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/state', (_req: Request, res: Response) => {
  res.json(getState());
});

// Restricted: only calNote (the shared planner note) is writable via this route.
// Every other collection has its own validated endpoint; a blanket overwrite was a
// remote-wipe footgun.
app.post('/api/state', (req: Request, res: Response) => {
  const body = (req.body || {}) as Record<string, unknown>;
  if (typeof body.calNote === 'string') {
    setState({ calNote: body.calNote });
  }
  res.json({ ok: true });
});

// Persist a user-authored collection (goals, books, ideas, journal, manual calendar
// events). Whitelisted so it can't overwrite server-owned collections like comms.
const WRITABLE_COLLECTIONS = new Set(['goals', 'books', 'ideas', 'journalEntries', 'calEvents', 'notes']);
app.put('/api/collection/:name', async (req: Request, res: Response) => {
  const name = String(req.params.name);
  if (!WRITABLE_COLLECTIONS.has(name)) { res.status(400).json({ error: 'not a writable collection' }); return; }
  const items = (req.body || {}).items;
  if (!Array.isArray(items)) { res.status(400).json({ error: 'items array required' }); return; }
  setState({ [name]: items } as unknown as Parameters<typeof setState>[0]);
  await persistNow();
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

// Toggle a specific past day (YYYY-MM-DD, user timezone) — backfill editor.
app.post('/api/habits/:id/toggle-date', async (req: Request, res: Response) => {
  const { date } = req.body as { date?: string };
  if (!date || !toggleHabitDate(req.params.id as string, date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD and not in the future' });
    return;
  }
  await persistNow();
  res.json({ ok: true });
});

app.delete('/api/habits/:id', async (req: Request, res: Response) => {
  deleteHabit(req.params.id as string);
  await persistNow();
  res.json({ ok: true });
});

// AskBar / Assistant chat — same Adler brain and shared tool layer as
// Telegram and the Whiteboard (agents.ts personas retired).
app.post('/api/ask', async (req: Request, res: Response) => {
  const { message } = req.body as { message?: string };
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  try {
    const text = await runAdler(message);
    res.json({ text, actions: [], agent: USER.assistant.toLowerCase() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
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
  audit('user', 'route:comm-dismiss', req.params.id as string).catch(() => {});
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
  try {
    const id = req.params.id as string;
    const body = id.startsWith('gm-') ? await fetchGmailBody(id) : await fetchEmailBody(id);
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
    // Non-blocking follow-ups against the fresh data
    extractDelegations().catch(() => {});
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
  // Accept optional `text` so the client can send exactly what's on screen, avoiding
  // a race where a just-edited draft sends its pre-edit stored copy.
  const { draftId, text } = req.body as { draftId: string; text?: string };
  const found = getState().drafts.find((d) => d.id === draftId);
  if (!found) { res.status(404).json({ error: 'draft not found' }); return; }
  if (found.status === 'sent') { res.status(409).json({ error: 'draft already sent' }); return; }
  if (!isAuthenticated() && !isGmailConnected()) { res.status(401).json({ error: 'No mail account connected', authUrl: '/api/outlook/auth' }); return; }
  const bodyText = typeof text === 'string' && text.trim() ? text : found.text;
  try {
    // Drafts linked to an inbox email send as in-thread replies, not new threads
    const extra = { cc: found.cc, bcc: found.bcc };
    if (found.commId?.startsWith('gm-')) {
      await replyGmail(found.commId, bodyText, false, extra);
    } else if (found.commId) {
      await replyToEmail(found.commId, bodyText, false, extra);
    } else {
      await sendEmail(found.to, found.re, bodyText, extra);
    }
    setState({ drafts: getState().drafts.map((d) => d.id === draftId ? { ...d, text: bodyText, status: 'sent' as const } : d) });
    audit('user', 'route:draft-send', draftId, `to ${found.to} re "${found.re}"`).catch(() => {});
    await persistNow();
    res.json({ ok: true });
  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Persist manual edits to a draft
app.post('/api/drafts/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body as { status?: 'ready' | 'discarded' };
  if (status !== 'ready' && status !== 'discarded') { res.status(400).json({ error: 'status must be ready|discarded' }); return; }
  const s = getState();
  if (!s.drafts.some((d) => d.id === req.params.id)) { res.status(404).json({ error: 'draft not found' }); return; }
  setState({ drafts: s.drafts.map((d) => d.id === req.params.id ? { ...d, status } : d) });
  await persistNow();
  res.json({ ok: true });
});

app.patch('/api/drafts/:id', async (req: Request, res: Response) => {
  const { text, cc, bcc } = req.body as { text?: string; cc?: string; bcc?: string };
  const s = getState();
  if (!s.drafts.some((d) => d.id === req.params.id)) { res.status(404).json({ error: 'draft not found' }); return; }
  setState({ drafts: s.drafts.map((d) => d.id === req.params.id ? {
    ...d,
    ...(typeof text === 'string' ? { text } : {}),
    ...(typeof cc === 'string' ? { cc } : {}),
    ...(typeof bcc === 'string' ? { bcc } : {}),
  } : d) });
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

  const prompt = `You are revising an email draft written on behalf of ${USER.name}. ${USER.bio}${s.userProfile ? `\n\nSTYLE PROFILE:\n${s.userProfile.slice(0, 3000)}` : ''}
${comm ? `\nORIGINAL EMAIL BEING REPLIED TO (from ${comm.who}, "${comm.subject}"):\n${(comm.body || comm.preview).slice(0, 3000)}\n` : ''}
CURRENT DRAFT:
${draft.text}

JEFF'S REVISION INSTRUCTION:
${instruction}

Rewrite the draft applying the instruction while keeping ${USER.firstName}'s voice. Keep the format: greeting line, blank line, short body, blank line, "${USER.signoff},\n${USER.firstName}". Return ONLY the revised reply text.`;

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

  const prompt = `You are drafting an email reply on behalf of ${USER.name}. ${USER.bio}${profileSection}

EMAIL TO REPLY TO:
From: ${comm.who}
Subject: ${comm.subject}

${(comm.body || comm.preview).slice(0, 4000)}

Write a reply that matches ${USER.firstName}'s communication and management style from the profile exactly — short, casual, direct. 1-4 sentences maximum unless the email genuinely requires more.

FORMAT (exactly this structure, with blank lines between parts):
Greeting line (e.g. "Hi Mike," or just the first name)

Body — one or two short paragraphs

${USER.signoff},
${USER.firstName}

No subject line. Return only the reply text.`;

  const response = await createCritical(client, {
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock?.type === 'text' ? textBlock.text : `Hi ${comm.who.split(' ')[0]}, thanks for reaching out. ${USER.signoff}, ${USER.firstName}`;

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
    if (isGmailConnected()) await syncGmail().catch((e) => console.warn('Gmail first sync failed:', (e as Error).message));
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
  const item = addShoppingItem(name.trim(), cat, addedBy || USER.firstName);
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

// ── Scheduling (draft-composer side pane: slot suggestions + recipient TZ) ────

app.get('/api/schedule/suggest', (req: Request, res: Response) => {
  const duration = Math.min(240, Math.max(15, parseInt(String(req.query.duration || '30'), 10) || 30));
  const days = Math.min(10, Math.max(1, parseInt(String(req.query.days || '5'), 10) || 5));
  res.json(suggestSlots(duration, days));
});

app.post('/api/schedule/tz-guess', async (req: Request, res: Response) => {
  const { commId } = req.body as { commId?: string };
  if (!commId) { res.status(400).json({ error: 'commId required' }); return; }
  res.json({ tz: await guessTimezone(commId) });
});

// ── Knowledge documents (uploaded markdowns → distilled into assistant memory) ─

app.post('/api/knowledge', async (req: Request, res: Response) => {
  const { name, content } = req.body as { name: string; content: string };
  if (!name?.trim() || !content?.trim()) { res.status(400).json({ error: 'name and content required' }); return; }
  const s = getState();
  const doc = {
    id: `kd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 120),
    content: content.slice(0, 200_000),
    addedAt: Date.now(),
  };

  // Distill into a memory section so the assistant carries the essence in context
  let summary = '';
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { MODELS } = await import('./models.js');
    const resp = await anthropicClient.messages.create({
      model: MODELS.standard,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `The user uploaded this document ("${doc.name}") so their personal assistant knows its contents. Distill everything the assistant should remember — facts about the user, preferences, ongoing projects, people, decisions, style notes. Write dense markdown, max ~300 words. Document:\n\n${doc.content.slice(0, 50_000)}`,
      }],
    });
    trackModelCall('knowledge-distill', resp.model, resp.usage).catch(() => {});
    const textBlock = resp.content.find((b) => b.type === 'text');
    summary = textBlock?.type === 'text' ? textBlock.text.trim() : '';
  } catch (err) {
    console.warn('Knowledge distillation failed:', (err as Error).message);
  }

  const slug = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || doc.id;
  setState({
    knowledge: [...s.knowledge, { ...doc, summary }],
    ...(summary ? { adlerNotes: { ...s.adlerNotes, [`doc_${slug}`]: summary } } : {}),
  });
  await persistNow();
  res.json({ ok: true, id: doc.id, distilled: !!summary });
});

app.get('/api/knowledge', (_req: Request, res: Response) => {
  res.json(getState().knowledge.map((k) => ({ id: k.id, name: k.name, addedAt: k.addedAt, size: k.content.length, distilled: !!k.summary })));
});

app.delete('/api/knowledge/:id', async (req: Request, res: Response) => {
  const s = getState();
  const doc = s.knowledge.find((k) => k.id === req.params.id);
  setState({ knowledge: s.knowledge.filter((k) => k.id !== req.params.id) });
  if (doc) {
    const slug = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || doc.id;
    const notes = { ...getState().adlerNotes };
    delete notes[`doc_${slug}`];
    setState({ adlerNotes: notes });
  }
  await persistNow();
  res.json({ ok: true });
});

// ── Setup status (drives the onboarding wizard) ───────────────────────────────

app.get('/api/setup/status', async (_req: Request, res: Response) => {
  const s = getState();
  const { getSubscriptionStatus } = await import('./webhooks.js');
  const { connHealth } = await import('./connhealth.js');
  const graphWebhook = await getSubscriptionStatus().catch(() => ({ active: false }));
  const health = connHealth();
  res.json({
    graphWebhook: graphWebhook.active,
    user: USER.name,
    assistant: USER.assistant,
    timezone: USER.tz,
    outlook: isAuthenticated(),
    googleCalendar: isGoogleAuthenticated(),
    gmail: isGmailConnected(),
    oura: isOuraConfigured(),
    telegram: !!process.env.TELEGRAM_BOT_TOKEN,
    apiSecured: !!process.env.ATLAS_SECRET || !!process.env.ATLAS_PASSWORD,
    styleProfile: !!s.userProfile,
    knowledgeDocs: s.knowledge.length,
    goodreads: isGoodreadsConfigured(),
    // Calendar-write requires re-consent to Calendars.ReadWrite (Outlook) / calendar.events (Google).
    calendarWrite: {
      work: hasCalendarWrite(),
      personal: hasCalendarWriteScope(),
    },
    // Surface dead connections so the UI can prompt a reconnect instead of going silently stale.
    needsReauth: {
      outlook: health.outlook.needsReauth,
      google: health.google.needsReauth,
    },
  });
});

// ── Gmail ─────────────────────────────────────────────────────────────────────

app.get('/api/gmail/status', (_req: Request, res: Response) => {
  res.json({ connected: isGmailConnected() });
});

app.get('/api/contacts/sync', async (_req: Request, res: Response) => {
  if (!isAuthenticated()) { res.status(401).json({ error: 'Outlook not connected' }); return; }
  try { await syncContacts(); res.json({ ok: true, count: getState().contacts.length }); }
  catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.get('/api/gmail/sync', async (_req: Request, res: Response) => {
  if (!isGmailConnected()) { res.status(401).json({ error: 'Gmail not connected — re-connect Google', authUrl: '/api/google/auth' }); return; }
  try {
    await syncGmail();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Delegations ───────────────────────────────────────────────────────────────

app.post('/api/delegations', async (req: Request, res: Response) => {
  const { what, who, dueDate } = req.body as { what: string; who: string; dueDate?: string };
  if (!what?.trim() || !who?.trim()) { res.status(400).json({ error: 'what and who required' }); return; }
  const d = addDelegation({ what: what.trim(), who: who.trim(), dueDate });
  await persistNow();
  res.json({ ok: true, delegation: d });
});

app.post('/api/delegations/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body as { status: 'open' | 'nudged' | 'done' | 'slipped' };
  setDelegationStatus(req.params.id as string, status);
  await persistNow();
  res.json({ ok: true });
});

app.delete('/api/delegations/:id', async (req: Request, res: Response) => {
  deleteDelegation(req.params.id as string);
  await persistNow();
  res.json({ ok: true });
});

app.post('/api/delegations/extract', async (_req: Request, res: Response) => {
  try {
    const added = await extractDelegations();
    res.json({ ok: true, added });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Goodreads (Kindle reading via RSS shelves) ────────────────────────────────

app.get('/api/goodreads/sync', async (_req: Request, res: Response) => {
  if (!isGoodreadsConfigured()) { res.status(503).json({ error: 'GOODREADS_USER_ID not configured' }); return; }
  try {
    await syncGoodreads();
    await persistNow();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
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
  if (isGmailConnected()) {
    try { await syncGmail(); results.gmail = 'ok'; }
    catch (err) { results.gmail = (err as Error).message; }
  } else results.gmail = 'not connected';
  if (isOuraConfigured()) {
    try { await syncOura(); results.oura = 'ok'; }
    catch (err) { results.oura = (err as Error).message; }
  } else results.oura = 'not configured';
  if (isGoodreadsConfigured()) {
    try { await syncGoodreads(); results.goodreads = 'ok'; }
    catch (err) { results.goodreads = (err as Error).message; }
  } else results.goodreads = 'not configured';
  await persistNow();
  res.json(results);
  extractDelegations().catch(() => {});
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

app.get('/api/eval/emails', async (_req: Request, res: Response) => {
  try {
    const { getEvalEmails } = await import('./evals.js');
    res.json(await getEvalEmails());
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.post('/api/eval/label', async (req: Request, res: Response) => {
  try {
    const { setLabel } = await import('./evals.js');
    const { id, from, subject, preview, label } = req.body;
    const total = await setLabel({ id, from, subject, preview }, label);
    res.json({ ok: true, total });
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.post('/api/eval/run', async (_req: Request, res: Response) => {
  try {
    const { runEval } = await import('./evals.js');
    res.json(await runEval());
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.get('/api/admin/audit', async (req: Request, res: Response) => {
  const { getAudit } = await import('./audit.js');
  res.json(await getAudit(parseInt((req.query.limit as string) || '200', 10)));
});

app.get('/api/admin/costs', async (_req: Request, res: Response) => {
  const { getCosts } = await import('./audit.js');
  res.json(await getCosts(USER.tz));
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

// ── Microsoft Graph change notifications ──────────────────────────────────────

app.post('/webhook/graph', (req: Request, res: Response) => {
  // Subscription validation handshake
  const validationToken = req.query.validationToken as string | undefined;
  if (validationToken) {
    res.status(200).type('text/plain').send(validationToken);
    return;
  }
  res.sendStatus(202); // ack immediately per Graph requirements
  const notifications = (req.body?.value || []) as { clientState?: string }[];
  if (notifications.some((n) => n.clientState === GRAPH_CLIENT_STATE)) {
    onMailNotification();
  }
});

// ── Telegram webhook ─────────────────────────────────────────────────────────

let bot: ReturnType<typeof createTelegramBot> | null = null;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_BASE = process.env.WEBHOOK_URL || process.env.FRONTEND_URL?.replace('atlas-dashboard', 'atlas-api') || '';

if (TELEGRAM_TOKEN && WEBHOOK_BASE) {
  const webhookPath = `/webhook/telegram`;
  const webhookUrl = `${WEBHOOK_BASE}${webhookPath}`;
  // Secret token Telegram echoes back in a header on every webhook POST, so we can
  // reject forged updates. Derived from ATLAS_SECRET (or bot token) — never guessable.
  const TG_SECRET = (process.env.ATLAS_SECRET || TELEGRAM_TOKEN).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 256);
  bot = createTelegramBot(webhookUrl);

  app.post('/webhook/telegram', (req: Request, res: Response) => {
    if (req.get('X-Telegram-Bot-Api-Secret-Token') !== TG_SECRET) {
      console.warn('Rejected Telegram webhook with bad/missing secret token');
      res.sendStatus(401);
      return;
    }
    bot!.processUpdate(req.body);
    res.sendStatus(200);
  });

  // Register webhook with Telegram (with the secret token so forged POSTs are rejected)
  async function registerWebhook() {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${encodeURIComponent(TG_SECRET)}`;
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

// ── Adler proactive check ─────────────────────────────────────────────────────
// Every 30 min, waking hours only, and skipped entirely when nothing relevant
// changed since the last check — this ran every 10 min with the full context
// (~20k tokens) around the clock and was a top token burner.
let _lastProactiveFingerprint = '';
setInterval(async () => {
  if (!bot || ownerChatIds().length === 0) return;
  const hour = parseInt(new Date().toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: USER.tz }), 10);
  if (hour < 7 || hour >= 21) return; // let the man sleep
  const s = getState();
  const fingerprint = [
    s.comms.filter((c) => c.status === 'open').map((c) => c.id).join(','),
    s.tasks.map((t) => `${t.id}${t.done ? 1 : 0}${t.column}`).join(','),
    s.habits.map((h) => `${h.id}${h.completedToday ? 1 : 0}`).join(','),
    s.dayPlan?.updatedAt || 0,
  ].join('|');
  if (fingerprint === _lastProactiveFingerprint) return; // nothing new to react to
  _lastProactiveFingerprint = fingerprint;
  try {
    const message = await adlerProactiveCheck();
    if (message) {
      ownerChatIds().forEach((chatId) => {
        bot!.sendMessage(chatId, `🧠 *Adler*\n\n${message}`, { parse_mode: 'Markdown' }).catch(() => {});
      });
    }
  } catch (err) {
    console.error('Adler proactive check error:', err);
  }
}, 30 * 60_000);

// Hourly: refresh habit derived fields so day rollover resets "done today" and streaks,
// and sweep delegation statuses (open → nudged at T-1 → slipped past due)
setInterval(() => {
  recomputeAllHabits();
  sweepDelegationStatuses();
  ensureGraphSubscription().catch(() => {}); // renew before the ~3-day Graph expiry
}, 60 * 60_000);

// Reconciliation sweep: webhooks can die silently — catch anything missed
setInterval(() => {
  if (isAuthenticated()) syncMail().catch(() => {});
  if (isGmailConnected()) syncGmail().catch(() => {});
}, 30 * 60_000);

// Manual briefing send — verifies the Telegram delivery path end to end.
app.post('/api/admin/send-briefing', async (_req: Request, res: Response) => {
  if (!bot) { res.status(503).json({ error: 'telegram not configured' }); return; }
  const owners = ownerChatIds();
  if (!owners.length) { res.status(404).json({ error: 'no owner chat ids known' }); return; }
  try {
    await Promise.all(owners.map((chatId) => sendMorningBriefing(bot!, chatId)));
    res.json({ ok: true, sentTo: owners.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Morning briefing at 7am ───────────────────────────────────────────────────

let _lastBriefingDate = new Date().toLocaleDateString('en-CA', { timeZone: USER.tz }); // don't re-send for today on boot

setInterval(() => {
  const now = new Date();
  const denverHour = parseInt(now.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: USER.tz }), 10);
  // Once-per-day gate instead of an exact minute match — a 60s interval can
  // skip minute :00 under timer drift, silently dropping the day's briefing.
  const denverDate = now.toLocaleDateString('en-CA', { timeZone: USER.tz });
  if (denverHour >= 7 && _lastBriefingDate !== denverDate) {
    _lastBriefingDate = denverDate;
    generateBriefing().catch(() => {});
    if (bot) ownerChatIds().forEach((chatId) => sendMorningBriefing(bot!, chatId).catch(() => {}));
  }
}, 60_000);

// Load persisted state then generate briefing
import { loadPersistedState, migrateLegacyState, isLoadedOk } from './state.js';
(async () => {
  await loadPersistedState();
  if (!isLoadedOk()) {
    console.error('Boot: state load did not succeed — skipping boot syncs to avoid clobbering data. Will operate read-only until Redis recovers.');
    return;
  }
  await migrateLegacyState().catch(() => {});
  try { recomputeAllHabits(); } catch { /* non-fatal */ }

  // Load OAuth tokens (independent providers — one failing must not block the other).
  await Promise.allSettled([loadOutlookToken(), loadGoogleToken()]);

  // Learn the user's email style once if we've never done it.
  if (isAuthenticated() && !getState().userProfile) {
    learnUserProfile()
      .then(() => persistNow())
      .then(() => console.log('User style profile learned at boot'))
      .catch((err) => console.warn('Boot profile learn failed:', (err as Error).message));
  }

  // Independent boot syncs — run concurrently, isolate failures.
  await Promise.allSettled([
    isOuraConfigured() ? syncOura() : Promise.resolve(),
    isGoodreadsConfigured() ? syncGoodreads() : Promise.resolve(),
    (async () => { sweepDelegationStatuses(); await extractDelegations(); })(),
    ensureGraphSubscription(),
    isAuthenticated() ? syncContacts() : Promise.resolve(),
  ]);

  await generateBriefing().catch((e) => console.warn('Boot briefing failed:', (e as Error).message));
})().catch((e) => console.error('Boot chain error:', (e as Error).message));

// Oura re-sync every 2 hours (new sleep data lands once a day, but readiness/activity update)
setInterval(() => {
  if (isOuraConfigured()) syncOura().catch(() => {});
  if (isGoodreadsConfigured()) syncGoodreads().catch(() => {});
}, 2 * 60 * 60_000);

// Contacts directory refresh twice a day (changes slowly)
setInterval(() => {
  if (isAuthenticated()) syncContacts().catch(() => {});
}, 12 * 60 * 60_000);

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
