// server/audit.ts — Phase A.2: audit log + model-call cost telemetry.
// Separate Redis keys (not main state) so the SSE stream and state persists
// aren't bloated. Ring-buffered: last 2000 audit rows, last 2000 model runs.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;
const AUDIT_KEY = 'atlas:auditLog';
const RUNS_KEY = 'atlas:agentRuns';

export interface AuditRow {
  ts: number;
  actor: 'user' | 'agent' | 'system';
  action: string;      // e.g. tool:reply_to_email, route:drafts/send
  objectRef?: string;  // id of the thing acted on
  detail?: string;     // short human-readable note (no full bodies — data minimization)
}

export interface AgentRun {
  ts: number;
  purpose: string;     // adler-chat, briefing, draft, triage, extraction, ...
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// $/MTok input, output — keep in sync with models.ts tiers
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-4-5': [1, 5],
  'claude-sonnet-4-6': [3, 15],
  'claude-opus-4-8': [5, 25],
  'claude-fable-5': [10, 50],
};
function priceFor(model: string): [number, number] {
  for (const key of Object.keys(PRICES)) if (model.startsWith(key)) return PRICES[key];
  return [3, 15]; // unknown → assume sonnet-tier
}

let _audit: AuditRow[] = [];
let _runs: AgentRun[] = [];
let _loaded = false;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

async function redisGetArr<T>(key: string): Promise<T[]> {
  if (!REDIS_URL || !REDIS_TOKEN) return [];
  try {
    const res = await fetch(`${REDIS_URL}/get/${key}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const json = await res.json() as { result: string | null };
    if (!json.result) return [];
    let parsed: unknown = JSON.parse(json.result);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch { return []; }
}

async function ensureLoaded(): Promise<void> {
  if (_loaded) return;
  _loaded = true;
  [_audit, _runs] = await Promise.all([redisGetArr<AuditRow>(AUDIT_KEY), redisGetArr<AgentRun>(RUNS_KEY)]);
}

function scheduleFlush(): void {
  if (_flushTimer) return;
  _flushTimer = setTimeout(async () => {
    _flushTimer = null;
    if (!REDIS_URL || !REDIS_TOKEN) return;
    const save = (key: string, val: unknown) => fetch(`${REDIS_URL}/set/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(val),
    }).catch(() => {});
    await Promise.all([save(AUDIT_KEY, _audit.slice(-2000)), save(RUNS_KEY, _runs.slice(-2000))]);
  }, 2000);
}

export async function audit(actor: AuditRow['actor'], action: string, objectRef?: string, detail?: string): Promise<void> {
  await ensureLoaded();
  _audit.push({ ts: Date.now(), actor, action, objectRef, detail: detail?.slice(0, 200) });
  if (_audit.length > 2200) _audit = _audit.slice(-2000);
  scheduleFlush();
}

// Track a completed Anthropic call. Pass the response's model + usage.
export async function trackModelCall(purpose: string, model: string, usage?: { input_tokens?: number; output_tokens?: number } | null): Promise<void> {
  await ensureLoaded();
  const input = usage?.input_tokens || 0;
  const output = usage?.output_tokens || 0;
  const [pin, pout] = priceFor(model);
  _runs.push({
    ts: Date.now(),
    purpose,
    model,
    inputTokens: input,
    outputTokens: output,
    costUsd: (input * pin + output * pout) / 1_000_000,
  });
  if (_runs.length > 2200) _runs = _runs.slice(-2000);
  scheduleFlush();
}

export async function getAudit(limit = 200): Promise<AuditRow[]> {
  await ensureLoaded();
  return _audit.slice(-limit).reverse();
}

export interface CostSummary {
  todayUsd: number;
  alert: boolean; // > $3/day quality bar
  days: { date: string; usd: number; calls: number }[];
  byPurposeToday: { purpose: string; usd: number; calls: number }[];
}

export async function getCosts(tz: string): Promise<CostSummary> {
  await ensureLoaded();
  const dayOf = (ts: number) => new Date(ts).toLocaleDateString('en-CA', { timeZone: tz });
  const today = dayOf(Date.now());
  const days = new Map<string, { usd: number; calls: number }>();
  const purposes = new Map<string, { usd: number; calls: number }>();
  for (const r of _runs) {
    const d = dayOf(r.ts);
    const day = days.get(d) || { usd: 0, calls: 0 };
    day.usd += r.costUsd; day.calls++;
    days.set(d, day);
    if (d === today) {
      const p = purposes.get(r.purpose) || { usd: 0, calls: 0 };
      p.usd += r.costUsd; p.calls++;
      purposes.set(r.purpose, p);
    }
  }
  const todayUsd = days.get(today)?.usd || 0;
  return {
    todayUsd,
    alert: todayUsd > 3,
    days: [...days.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14),
    byPurposeToday: [...purposes.entries()].map(([purpose, v]) => ({ purpose, ...v })).sort((a, b) => b.usd - a.usd),
  };
}
