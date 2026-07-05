// server/webhooks.ts — Phase A.4: Microsoft Graph change notifications for inbox
// mail (real-time ingestion instead of polling), with subscription auto-renewal
// (Graph mail subscriptions expire in ~3 days) and debounce into syncMail.

import { graphRequest, isAuthenticated, syncMail } from './outlook.js';
import { extractDelegations } from './delegations.js';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;
const SUB_KEY = 'atlas:graphSubscription';

const WEBHOOK_BASE = process.env.WEBHOOK_URL || '';
export const GRAPH_CLIENT_STATE = process.env.ATLAS_SECRET || 'atlas-graph-notifications';

interface StoredSub { id: string; expiration: string }

async function loadSub(): Promise<StoredSub | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(`${REDIS_URL}/get/${SUB_KEY}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const json = await res.json() as { result: string | null };
    if (!json.result) return null;
    let parsed: unknown = JSON.parse(json.result);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return parsed as StoredSub;
  } catch { return null; }
}

async function saveSub(sub: StoredSub | null): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  await fetch(`${REDIS_URL}/set/${SUB_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  }).catch(() => {});
}

// Create or renew the inbox subscription. Safe to call repeatedly (hourly).
export async function ensureGraphSubscription(): Promise<void> {
  if (!isAuthenticated() || !WEBHOOK_BASE) return;
  const expiration = new Date(Date.now() + 4200 * 60_000).toISOString(); // ~2.9 days (max ~3)
  const existing = await loadSub();

  if (existing) {
    const msLeft = new Date(existing.expiration).getTime() - Date.now();
    if (msLeft > 12 * 60 * 60_000) return; // still fresh
    try {
      await graphRequest('PATCH', `/subscriptions/${existing.id}`, { expirationDateTime: expiration });
      await saveSub({ id: existing.id, expiration });
      console.log('[webhooks] Graph subscription renewed');
      return;
    } catch (err) {
      console.warn('[webhooks] renewal failed, recreating:', (err as Error).message);
      await saveSub(null);
    }
  }

  try {
    const sub = await graphRequest('POST', '/subscriptions', {
      changeType: 'created',
      notificationUrl: `${WEBHOOK_BASE}/webhook/graph`,
      resource: "/me/mailFolders('inbox')/messages",
      expirationDateTime: expiration,
      clientState: GRAPH_CLIENT_STATE,
    }) as { id: string; expirationDateTime: string };
    await saveSub({ id: sub.id, expiration: sub.expirationDateTime });
    console.log('[webhooks] Graph subscription created:', sub.id);
  } catch (err) {
    console.warn('[webhooks] subscription create failed:', (err as Error).message);
  }
}

// Debounced reaction to notifications — bursts of mail trigger one sync
let _syncTimer: ReturnType<typeof setTimeout> | null = null;
export function onMailNotification(): void {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    _syncTimer = null;
    try {
      await syncMail();
      await extractDelegations();
      console.log('[webhooks] mail synced from Graph notification');
    } catch (err) {
      console.warn('[webhooks] notification sync failed:', (err as Error).message);
    }
  }, 5000);
}
