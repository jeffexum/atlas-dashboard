// server/outlook.ts — Microsoft Graph OAuth2 + mail/calendar sync

import Anthropic from '@anthropic-ai/sdk';
import { trackModelCall, audit } from './audit.js';
import { getState, setState } from './state.js';
import { MODELS, createCritical } from './models.js';
import { markOk, markReauth, markError, isInvalidGrant } from './connhealth.js';
import { USER } from './config.js';

// IANA → Windows timezone names for Graph's Prefer header (common US/EU zones;
// extend as instances appear in new regions).
const WINDOWS_TZ: Record<string, string> = {
  'America/Denver': 'Mountain Standard Time',
  'America/Los_Angeles': 'Pacific Standard Time',
  'America/Phoenix': 'US Mountain Standard Time',
  'America/Chicago': 'Central Standard Time',
  'America/New_York': 'Eastern Standard Time',
  'Europe/London': 'GMT Standard Time',
  'Europe/Berlin': 'W. Europe Standard Time',
  'Europe/Paris': 'Romance Standard Time',
  'Asia/Tokyo': 'Tokyo Standard Time',
  'Australia/Sydney': 'AUS Eastern Standard Time',
};

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
const TENANT_ID = process.env.MICROSOFT_TENANT_ID || '';
// Derive from the API's public base if a dedicated var isn't set; never fall back to
// a hardcoded personal instance (that would send another user's OAuth code to it).
const API_BASE = process.env.WEBHOOK_URL || process.env.PUBLIC_API_URL || '';
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || (API_BASE ? `${API_BASE}/api/outlook/callback` : '');

const SCOPES = ['offline_access', 'User.Read', 'Mail.Read', 'Mail.Send', 'Calendars.ReadWrite'];

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms timestamp
  scope?: string; // space-separated granted scopes (from the token response)
}

// True only once the user has re-consented to Calendars.ReadWrite.
export function hasCalendarWrite(): boolean {
  return !!tokenData?.scope?.includes('Calendars.ReadWrite');
}

// Token store — persisted to Redis so auth survives restarts
let tokenData: TokenData | null = null;

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;
const TOKEN_KEY = 'atlas:outlookToken';

async function saveToken(t: TokenData): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  await fetch(`${REDIS_URL}/set/${TOKEN_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(t),
  });
}

async function loadToken(): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    const res = await fetch(`${REDIS_URL}/get/${TOKEN_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await res.json() as { result: string | null };
    if (json.result) {
      let parsed: unknown = JSON.parse(json.result);
      // Legacy double-encoded token: parses to a string, which is truthy but has no
      // .access_token — this made isAuthenticated() lie after every redeploy
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      tokenData = parsed as TokenData;
    }
  } catch { /* ignore */ }
}

export { loadToken as loadOutlookToken };

export async function learnUserProfile(): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  // Fetch last 30 sent emails (body preview + subject + recipients)
  const sentData = await graphGet(
    '/me/mailFolders/SentItems/messages?$top=30&$orderby=sentDateTime%20desc&$select=id,subject,toRecipients,sentDateTime,body'
  ) as { value: GraphMessageFull[] };

  // Fetch last 20 inbox emails for context on incoming tone/topics
  const inboxData = await graphGet(
    '/me/mailFolders/inbox/messages?$top=20&$orderby=receivedDateTime%20desc&$select=id,subject,from,receivedDateTime,bodyPreview'
  ) as { value: GraphMessage[] };

  const sentSnippets = (sentData.value || []).map((m) => {
    const to = (m.toRecipients || []).map((r) => r.emailAddress?.name || r.emailAddress?.address).join(', ');
    const body = m.body?.content
      ? m.body.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
      : '';
    return `To: ${to}\nSubject: ${m.subject || '(no subject)'}\n${body}`;
  }).join('\n\n---\n\n');

  const inboxSnippets = (inboxData.value || []).map((m) =>
    `From: ${m.from?.emailAddress?.name || m.from?.emailAddress?.address}\nSubject: ${m.subject || '(no subject)'}\nPreview: ${m.bodyPreview?.slice(0, 200) || ''}`
  ).join('\n\n---\n\n');

  const prompt = `You are analyzing a professional's email history to build a communication profile.

SENT EMAILS (last 30):
${sentSnippets || '(none available)'}

RECEIVED EMAILS (last 20):
${inboxSnippets || '(none available)'}

Based on these emails, write a detailed markdown profile covering:

1. **Company & Role** — What company does this person work at? What is their role/title? What does the company do?
2. **Communication Style** — How do they write emails? Tone (formal/casual), length, structure, sign-off phrases they use, any recurring language patterns.
3. **Key Relationships** — Who do they email most? Internal team members vs. external clients/partners?
4. **Topics & Themes** — What are the recurring subjects, projects, or business areas they deal with?
5. **Draft Reply Guidelines** — Specific guidance for drafting replies on their behalf: how to open, how to close, what to avoid, typical response length.

Write in markdown. Be specific — use actual names, phrases, and examples you observe in the emails. This profile will be used to draft emails on their behalf.`;

  const response = await createCritical(getClient(), {
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find((b) => b.type === 'text');
  const profile = text?.type === 'text' ? text.text : '';

  setState({ userProfile: profile });
  return profile;
}

export function getAuthUrl(): string {
  if (!REDIRECT_URI) throw new Error('MICROSOFT_REDIRECT_URI (or WEBHOOK_URL/PUBLIC_API_URL) not configured');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    response_mode: 'query',
  });
  return `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeCode(code: string): Promise<void> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!data.access_token) throw new Error(data.error_description || 'Token exchange failed');

  tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || '',
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope || SCOPES.join(' '),
  };
  await saveToken(tokenData);
}

let _refreshInFlight: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  // Single-flight: concurrent 401s must not each POST the (rotating) refresh token,
  // which can invalidate the token family and force a needless re-auth.
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = _doRefresh().finally(() => { _refreshInFlight = null; });
  return _refreshInFlight;
}

async function _doRefresh(): Promise<void> {
  if (!tokenData?.refresh_token) { markReauth('outlook', 'no refresh token'); throw new Error('No refresh token — re-auth required'); }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: tokenData.refresh_token,
    grant_type: 'refresh_token',
    scope: SCOPES.join(' '),
  });

  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!data.access_token) {
    if (isInvalidGrant(data.error)) {
      markReauth('outlook', data.error || 'invalid_grant');
      console.error('Outlook refresh token is dead — user must reconnect. Surfaced in setup status.');
    } else {
      markError('outlook', data.error || 'refresh failed');
    }
    throw new Error('Token refresh failed: ' + data.error);
  }

  tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokenData.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope || tokenData.scope,
  };
  await saveToken(tokenData);
  markOk('outlook');
}

async function getAccessToken(): Promise<string> {
  if (!tokenData) throw new Error('Not authenticated — visit /api/outlook/auth');
  if (Date.now() > tokenData.expires_at - 60_000) {
    await refreshAccessToken();
  }
  return tokenData.access_token;
}

export function isAuthenticated(): boolean {
  return tokenData !== null;
}

// Generic Graph call with auth + refresh (for subscriptions etc.)
export async function graphRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  let token = await getAccessToken();
  const doFetch = (tk: string) => fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let res = await doFetch(token);
  if (res.status === 401) {
    await refreshAccessToken();
    token = tokenData!.access_token;
    res = await doFetch(token);
  }
  if (!res.ok) throw new Error(`Graph ${method} ${path} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (res.status === 204) return null;
  return res.json();
}

// Create a real event on the user's Outlook calendar. Wall-clock local time +
// IANA timezone so no offset math is needed. Returns the created event id.
export async function createOutlookEvent(opts: {
  subject: string; startLocal: string; endLocal: string; tz: string; body?: string;
}): Promise<string> {
  const created = await graphRequest('POST', '/me/events', {
    subject: opts.subject,
    body: opts.body ? { contentType: 'text', content: opts.body } : undefined,
    start: { dateTime: opts.startLocal, timeZone: opts.tz },
    end: { dateTime: opts.endLocal, timeZone: opts.tz },
  }) as { id?: string };
  return created?.id || '';
}

// Delete an event from the user's Outlook calendar by Graph event id.
export async function deleteOutlookEvent(eventId: string): Promise<void> {
  await graphRequest('DELETE', `/me/events/${eventId}`);
}

export async function graphGet(path: string, extraHeaders?: Record<string, string>): Promise<unknown> {
  let token = await getAccessToken();
  let res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  });
  // Stored access token can be stale even before expires_at (e.g. after redeploy) — force refresh and retry once
  if (res.status === 401) {
    await refreshAccessToken();
    token = tokenData!.access_token;
    res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    });
  }
  if (!res.ok) throw new Error(`Graph API ${path} returned ${res.status}`);
  return res.json();
}

async function graphPost(path: string, body: unknown): Promise<void> {
  let token = await getAccessToken();
  let res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    await refreshAccessToken();
    token = tokenData!.access_token;
    res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph API POST ${path} returned ${res.status}: ${err}`);
  }
}

// Reply within the original thread via Graph — recipients, subject, and threading
// headers all come from the original message
export async function replyToEmail(messageId: string, body: string, replyAll = false): Promise<void> {
  const endpoint = replyAll ? 'replyAll' : 'reply';
  await graphPost(`/me/messages/${encodeURIComponent(messageId)}/${endpoint}`, {
    comment: body.replace(/\n/g, '<br>'),
  });
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  // Resolve the recipient by NAME (or accept a literal address). Never match on
  // subject — that could silently send to an unrelated person who happens to share
  // a subject line. This tool starts a NEW message, so don't force a "Re:" prefix.
  const { getState } = await import('./state.js');
  const comms = getState().comms as (ReturnType<typeof getState>['comms'][number] & { email?: string })[];
  const toAddress = to.includes('@')
    ? to.trim()
    : (comms.find((c) => c.who === to)?.email || '');
  if (!toAddress) throw new Error(`Cannot resolve email address for "${to}" — pass a full address or sync inbox first`);

  await graphPost('/me/sendMail', {
    message: {
      subject: subject || '(no subject)',
      body: { contentType: 'Text', content: body },
      toRecipients: [{ emailAddress: { address: toAddress } }],
    },
    saveToSentItems: true,
  });
}

interface GraphMessageFull {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  receivedDateTime?: string;
  body?: { content?: string; contentType?: string };
  inferenceClassification?: 'focused' | 'other';
}

interface GraphMessage {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  isRead?: boolean;
  inferenceClassification?: 'focused' | 'other';
  conversationId?: string;
}

interface GraphEvent {
  id: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  organizer?: { emailAddress?: { name?: string } };
  location?: { displayName?: string };
  isAllDay?: boolean;
  bodyPreview?: string;
}

export function fmtRelative(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = diffMs / 3600000;
  if (diffHrs < 1) return `${Math.round(diffMs / 60000)}m ago`;
  if (diffHrs < 24) return d.toLocaleTimeString('en-US', { timeZone: USER.tz, hour: 'numeric', minute: '2-digit', hour12: true });
  return d.toLocaleDateString('en-US', { timeZone: USER.tz, month: 'short', day: 'numeric' });
}

export async function fetchEmailBody(messageId: string): Promise<string> {
  const data = await graphGet(`/me/messages/${encodeURIComponent(messageId)}?$select=body`) as { body?: { content?: string; contentType?: string } };
  const raw = data.body?.content || '';
  return data.body?.contentType === 'html' ? stripHtml(raw) : raw.trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, '\n')
    .trim();
}

// Automated sender patterns to always filter out
const AUTOMATED_PATTERNS = [
  /no.?reply/i, /noreply/i, /do.?not.?reply/i,
  /notifications?@/i, /alerts?@/i, /updates?@/i,
  /newsletter/i, /digest@/i, /mailer@/i,
  /support@.*\.(zendesk|freshdesk|intercom)/i,
];

export function isAutomated(email: string, subject: string): boolean {
  if (AUTOMATED_PATTERNS.some((p) => p.test(email))) return true;
  if (/unsubscribe|notification|automated|auto-generated/i.test(subject)) return true;
  return false;
}

export async function scoreEmailsWithAI(emails: { id: string; from: string; subject: string; preview: string }[]): Promise<Set<string>> {
  if (!emails.length || !process.env.ANTHROPIC_API_KEY) return new Set(emails.map((e) => e.id));
  const list = emails.map((e, i) => `${i + 1}. From: ${e.from} | Subject: ${e.subject} | Preview: ${e.preview}`).join('\n');
  const response = await getClient().messages.create({
    model: MODELS.cheap,
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `You are filtering a CEO's inbox. Return ONLY the numbers of emails that need a human response or action — skip newsletters, FYI updates, automated notifications, receipts, and calendar invites already accepted.

${list}

Reply with just the numbers, comma-separated. Example: 1,3,5`,
    }],
  });
  trackModelCall('email-triage', response.model, response.usage).catch(() => {});
  const text = response.content.find((b) => b.type === 'text');
  const raw = text?.type === 'text' ? text.text.trim() : '';
  const indices = new Set(raw.split(',').map((n) => parseInt(n.trim(), 10) - 1).filter((n) => !isNaN(n)));
  return new Set(emails.filter((_, i) => indices.has(i)).map((e) => e.id));
}

let _syncMailInFlight: Promise<void> | null = null;
export async function syncMail(): Promise<void> {
  // Single-flight: interval + webhook + manual + agent tool can all trigger this.
  if (_syncMailInFlight) return _syncMailInFlight;
  _syncMailInFlight = _syncMail().finally(() => { _syncMailInFlight = null; });
  return _syncMailInFlight;
}

async function _syncMail(): Promise<void> {
  // 30-day window
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

  // Paginate until oldest message is before stopBefore (max 500 messages)
  async function fetchPaged(path: string, stopBefore: Date, dateField: string, maxItems = 500): Promise<GraphMessage[]> {
    const all: GraphMessage[] = [];
    let nextUrl: string | null = path;
    while (nextUrl && all.length < maxItems) {
      // graphGet expects a path; strip base URL if nextLink is absolute
      const pathOrUrl = nextUrl.startsWith(GRAPH_BASE) ? nextUrl.slice(GRAPH_BASE.length) : nextUrl;
      const page = await graphGet(pathOrUrl) as { value: GraphMessage[]; '@odata.nextLink'?: string };
      const items = page.value || [];
      if (!items.length) break;
      all.push(...items);
      const oldest = items[items.length - 1] as unknown as Record<string, unknown>;
      const oldestDate = oldest[dateField] as string | undefined;
      if (!oldestDate || new Date(oldestDate) < stopBefore) break;
      nextUrl = page['@odata.nextLink'] || null;
    }
    return all;
  }

  interface SentMessage { conversationId?: string; sentDateTime?: string; }

  const [inboxMessages, sentRaw] = await Promise.all([
    fetchPaged(
      `/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime%20desc&$select=id,subject,from,receivedDateTime,bodyPreview,body,isRead,conversationId`,
      since, 'receivedDateTime'
    ),
    // Don't paginate sent items — Graph's $skip on sentItems is unreliable; 200 covers ~30 days for most users
    graphGet(`/me/mailFolders/sentItems/messages?$top=200&$orderby=sentDateTime%20desc&$select=conversationId,sentDateTime`),
  ]);

  const sentMessages = ((sentRaw as { value?: SentMessage[] }).value) || [];

  // Build set of conversation IDs Jeff has already replied to (within 30 days)
  const repliedConvIds = new Set(
    sentMessages
      .filter((m) => !m.sentDateTime || new Date(m.sentDateTime) >= since)
      .map((m) => m.conversationId)
      .filter((id): id is string => typeof id === 'string')
  );

  // Filter: within 30 days, not already replied, not automated
  const candidates = inboxMessages.filter((m) => {
    if (m.receivedDateTime && new Date(m.receivedDateTime) < since) return false;
    if (m.conversationId && repliedConvIds.has(m.conversationId)) return false;
    const fromAddr = m.from?.emailAddress?.address || '';
    if (isAutomated(fromAddr, m.subject || '')) return false;
    return true;
  });

  // AI scoring — use Haiku for speed/cost
  const actionable = await scoreEmailsWithAI(candidates.map((m) => ({
    id: m.id,
    from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
    subject: m.subject || '',
    preview: m.bodyPreview?.slice(0, 200) || '',
  })));

  const priorities = ['p1', 'p2', 'p3'] as const;
  let idx = 0;

  const comms = candidates
    .filter((m) => actionable.has(m.id))
    .map((msg) => {
      const rawBody = msg.body?.content || '';
      const body = msg.body?.contentType === 'html' ? stripHtml(rawBody) : rawBody.trim();
      return {
        id: msg.id,
        source: 'email' as const,
        who: msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || 'Unknown',
        email: msg.from?.emailAddress?.address || '',
        subject: msg.subject || '(no subject)',
        preview: msg.bodyPreview?.slice(0, 120) || '',
        body: (body || msg.bodyPreview || '').slice(0, 3000),
        time: fmtRelative(msg.receivedDateTime),
        priority: priorities[Math.min(idx++, 2)],
        status: 'open' as const,
      };
    });

  // Preserve snoozed/dismissed status across re-syncs so hidden emails stay hidden,
  // and keep Gmail comms (gm- prefix) — this sync owns only Outlook messages
  const st = getState();
  const priorComms = st.comms;
  const overrides = st.commStatusOverrides;
  const gmailComms = priorComms.filter((c) => c.id.startsWith('gm-'));
  const merged = [
    ...gmailComms,
    ...comms.map((c) => {
      const hidden = overrides[c.id];
      return hidden ? { ...c, status: hidden } : c;
    }),
  ];

  console.log(`[syncMail] ${inboxMessages.length} fetched → ${candidates.length} unreplied/non-automated → ${merged.length} actionable`);
  setState({ comms: merged });
  markOk('outlook');
}

export async function syncCalendar(): Promise<void> {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);

  // Fetch from the start of today (Denver) so events earlier in the day stay visible
  const startOfDay = new Date(now.getTime() - 30 * 60 * 60_000); // generous 30h back covers TZ offset + full day
  const start = startOfDay.toISOString();
  const endStr = end.toISOString();

  const data = await graphGet(
    `/me/calendarview?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(endStr)}&$top=50&$orderby=start/dateTime&$select=id,subject,start,end,organizer,location,isAllDay,bodyPreview`,
    { 'Prefer': `outlook.timezone="${WINDOWS_TZ[USER.tz] || 'Mountain Standard Time'}"` }
  ) as { value: GraphEvent[] };

  const colorPalette = ['var(--blue)', 'var(--violet)', 'var(--accent)', 'var(--warm)', 'var(--p1)'];

  // Graph returns dateTime already in the event's local timezone (no UTC offset).
  // Parse components directly from the string — no timezone math needed.
  function parseDt(dtStr: string): { year: number; month: number; day: number; hour: number; minute: number } {
    const [datePart = '', timePart = ''] = dtStr.split('T');
    const [year = 0, month = 1, day = 1] = datePart.split('-').map(Number);
    const [hour = 0, minute = 0] = timePart.split(':').map(Number);
    return { year, month, day, hour, minute };
  }

  const calEvents = (data.value || []).flatMap((evt, i) => {
    const s = parseDt(evt.start?.dateTime || '');
    const e = parseDt(evt.end?.dateTime || '');
    const isAllDay = !!(evt as { isAllDay?: boolean }).isAllDay;
    const color = colorPalette[i % colorPalette.length];

    if (isAllDay) {
      // Multi-day all-day events: one banner per covered day (Graph end is
      // exclusive midnight). Capped defensively at 60 days.
      const out = [];
      const cur = new Date(s.year, s.month - 1, s.day);
      const end = new Date(e.year, e.month - 1, e.day);
      for (let j = 0; cur < end && j < 60; cur.setDate(cur.getDate() + 1), j++) {
        out.push({
          id: `${evt.id}${j ? `-d${j}` : ''}`,
          title: `📅 ${evt.subject || '(no title)'}`,
          start: 8,
          duration: 1,
          color,
          category: 'Work',
          date: cur.getDate(),
          month: cur.getMonth() + 1,
          year: cur.getFullYear(),
          source: 'work' as const,
          allDay: true,
        });
      }
      return out;
    }

    const startHour = s.hour + s.minute / 60;
    const endHour = e.hour + e.minute / 60;
    const durationHours = endHour > startHour ? endHour - startHour : Math.max(0.5, endHour + 24 - startHour);
    return [{
      id: evt.id,
      title: evt.subject || '(no title)',
      start: startHour,
      duration: Math.max(0.5, durationHours),
      color,
      category: 'Work',
      date: s.day,
      month: s.month,
      year: s.year,
      source: 'work' as const,
    }];
  });

  // Merge: keep Google (personal) events, replace only Outlook ones
  const st = getState();
  const personal = st.calEvents.filter((e) => e.id.startsWith('gcal-'));
  setState({ calEvents: [...personal, ...calEvents] });
}
