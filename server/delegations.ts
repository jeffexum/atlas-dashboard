// server/delegations.ts — delegation tracker (Phase A.1, spec F3).
// Extracts commitments others made from email, tracks them to done,
// flips status to nudged/slipped as due dates approach/pass, and
// escalates via the briefing + Adler's proactive channel.

import Anthropic from '@anthropic-ai/sdk';
import { trackModelCall } from './audit.js';
import { getState, setState, persistNow } from './state.js';
import type { Delegation } from './state.js';
import { MODELS } from './models.js';
import { USER } from './config.js';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;
const SCANNED_KEY = 'atlas:delegScannedCommIds';

let _scanned: Set<string> | null = null;

async function loadScanned(): Promise<Set<string>> {
  if (_scanned) return _scanned;
  _scanned = new Set();
  if (!REDIS_URL || !REDIS_TOKEN) return _scanned;
  try {
    const res = await fetch(`${REDIS_URL}/get/${SCANNED_KEY}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const json = await res.json() as { result: string | null };
    if (json.result) {
      let parsed: unknown = JSON.parse(json.result);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (Array.isArray(parsed)) _scanned = new Set(parsed as string[]);
    }
  } catch { /* start fresh */ }
  return _scanned;
}

async function saveScanned(): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN || !_scanned) return;
  await fetch(`${REDIS_URL}/set/${SCANNED_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([..._scanned].slice(-800)),
  }).catch(() => {});
}

export function addDelegation(input: { what: string; who: string; dueDate?: string; sourceCommId?: string; sourceQuote?: string }): Delegation {
  const d: Delegation = {
    id: `dg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    what: input.what,
    who: input.who,
    dueDate: input.dueDate,
    sourceCommId: input.sourceCommId,
    sourceQuote: input.sourceQuote,
    status: 'open',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  setState({ delegations: [...getState().delegations, d] });
  return d;
}

export function setDelegationStatus(id: string, status: Delegation['status']): void {
  setState({
    delegations: getState().delegations.map((d) => d.id === id ? { ...d, status, updatedAt: Date.now() } : d),
  });
}

export function deleteDelegation(id: string): void {
  setState({ delegations: getState().delegations.filter((d) => d.id !== id) });
}

// ── Extraction: scan new actionable emails once each, via the cheap model ────

interface Extracted { what: string; who: string; dueDate?: string; quote?: string }

let _extractInFlight = false;

export async function extractDelegations(): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0;
  if (_extractInFlight) return 0; // boot + sync can race — one scan at a time
  _extractInFlight = true;
  try {
    return await doExtract();
  } finally {
    _extractInFlight = false;
  }
}

async function doExtract(): Promise<number> {
  const scanned = await loadScanned();
  const s = getState();
  const fresh = s.comms.filter((c) => c.status === 'open' && !scanned.has(c.id)).slice(0, 15);
  if (!fresh.length) return 0;

  const emailBlock = fresh.map((c, i) =>
    `[${i}] From: ${c.who}\nSubject: ${c.subject}\n${(c.body || c.preview).slice(0, 1200)}`
  ).join('\n\n---\n\n');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let extracted: (Extracted & { emailIndex: number })[] = [];
  try {
    const resp = await client.messages.create({
      model: MODELS.cheap,
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are scanning ${USER.firstName}'s emails for COMMITMENTS OTHER PEOPLE made — things ${USER.firstName} is waiting on. Examples: "I'll send the redline by Friday", "we'll wire the funds next week", "the quote will be ready Tuesday".

Do NOT extract: things ${USER.firstName} himself promised, generic pleasantries, newsletters, or vague intentions with no deliverable.

EMAILS:
${emailBlock}

Today is ${new Date().toLocaleDateString('en-CA', { timeZone: USER.tz })}. Return JSON only:
{"commitments":[{"emailIndex":0,"who":"person's name","what":"short description of the deliverable","dueDate":"YYYY-MM-DD or omit if unstated","quote":"the sentence containing the commitment"}]}
Return {"commitments":[]} if none.`,
      }],
    });
    trackModelCall('delegation-extract', resp.model, resp.usage).catch(() => {});
    const text = resp.content.find((b) => b.type === 'text');
    const raw = text?.type === 'text' ? text.text : '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) extracted = (JSON.parse(m[0]).commitments || []);
  } catch (err) {
    console.warn('[delegations] extraction failed:', (err as Error).message);
    return 0; // don't mark scanned on failure — retry next sync
  }

  // Mark all scanned emails regardless of hits
  fresh.forEach((c) => scanned.add(c.id));
  await saveScanned();

  const existing = new Set(getState().delegations.map((d) => `${d.who}|${d.what}`.toLowerCase()));
  const existingSources = new Set(getState().delegations.map((d) => `${d.sourceCommId}|${d.who}`.toLowerCase()));
  let added = 0;
  for (const e of extracted) {
    const source = fresh[e.emailIndex];
    if (!e.what || !e.who) continue;
    if (existing.has(`${e.who}|${e.what}`.toLowerCase())) continue;
    if (source && existingSources.has(`${source.id}|${e.who}`.toLowerCase())) continue; // same person, same email → already tracked
    addDelegation({
      what: e.what,
      who: e.who,
      dueDate: e.dueDate,
      sourceCommId: source?.id,
      sourceQuote: e.quote?.slice(0, 300),
    });
    added++;
  }
  if (added) await persistNow();
  console.log(`[delegations] scanned ${fresh.length} emails, extracted ${added} new commitments`);
  return added;
}

// ── Status sweep: open → nudged (due tomorrow) → slipped (past due) ──────────

export function sweepDelegationStatuses(): { toNudge: Delegation[]; newlySlipped: Delegation[] } {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: USER.tz });
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: USER.tz });
  const toNudge: Delegation[] = [];
  const newlySlipped: Delegation[] = [];

  const updated = getState().delegations.map((d) => {
    if (d.status === 'done' || !d.dueDate) return d;
    if (d.dueDate < today && d.status !== 'slipped') {
      const nd = { ...d, status: 'slipped' as const, updatedAt: Date.now() };
      newlySlipped.push(nd);
      return nd;
    }
    if (d.dueDate === tomorrow && d.status === 'open') {
      const nd = { ...d, status: 'nudged' as const, updatedAt: Date.now() };
      toNudge.push(nd);
      return nd;
    }
    return d;
  });

  if (toNudge.length || newlySlipped.length) setState({ delegations: updated });
  return { toNudge, newlySlipped };
}
