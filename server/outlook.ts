// server/outlook.ts — Microsoft Graph OAuth2 + mail/calendar sync

import Anthropic from '@anthropic-ai/sdk';
import { getState, setState } from './state.js';

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
const TENANT_ID = process.env.MICROSOFT_TENANT_ID || '';
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'https://atlas-api-fdlq.onrender.com/api/outlook/callback';

const SCOPES = ['offline_access', 'User.Read', 'Mail.Read', 'Mail.Send', 'Calendars.Read'];

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms timestamp
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
    body: JSON.stringify(JSON.stringify(t)),
  });
}

async function loadToken(): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    const res = await fetch(`${REDIS_URL}/get/${TOKEN_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await res.json() as { result: string | null };
    if (json.result) tokenData = JSON.parse(json.result) as TokenData;
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

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find((b) => b.type === 'text');
  const profile = text?.type === 'text' ? text.text : '';

  setState({ userProfile: profile });
  return profile;
}

export function getAuthUrl(): string {
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

  const data = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!data.access_token) throw new Error(data.error_description || 'Token exchange failed');

  tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || '',
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
  };
  await saveToken(tokenData);
}

async function refreshAccessToken(): Promise<void> {
  if (!tokenData?.refresh_token) throw new Error('No refresh token — re-auth required');

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

  const data = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!data.access_token) throw new Error('Token refresh failed: ' + data.error);

  tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokenData.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
  };
  await saveToken(tokenData);
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

async function graphGet(path: string, extraHeaders?: Record<string, string>): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  });
  if (!res.ok) throw new Error(`Graph API ${path} returned ${res.status}`);
  return res.json();
}

async function graphPost(path: string, body: unknown): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph API POST ${path} returned ${res.status}: ${err}`);
  }
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  // to is a display name — look up the real address from comms
  const { getState } = await import('./state.js');
  const comms = getState().comms as (ReturnType<typeof getState>['comms'][number] & { email?: string })[];
  const comm = comms.find((c) => c.who === to || c.subject === subject);
  const toAddress = comm?.email || (to.includes('@') ? to : '');
  if (!toAddress) throw new Error(`Cannot resolve email address for "${to}" — sync inbox first`);

  await graphPost('/me/sendMail', {
    message: {
      subject: subject ? `Re: ${subject}` : '(no subject)',
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

function fmtRelative(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = diffMs / 3600000;
  if (diffHrs < 1) return `${Math.round(diffMs / 60000)}m ago`;
  if (diffHrs < 24) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

function isAutomated(email: string, subject: string): boolean {
  if (AUTOMATED_PATTERNS.some((p) => p.test(email))) return true;
  if (/unsubscribe|notification|automated|auto-generated/i.test(subject)) return true;
  return false;
}

async function scoreEmailsWithAI(emails: { id: string; from: string; subject: string; preview: string }[]): Promise<Set<string>> {
  if (!emails.length || !process.env.ANTHROPIC_API_KEY) return new Set(emails.map((e) => e.id));
  const list = emails.map((e, i) => `${i + 1}. From: ${e.from} | Subject: ${e.subject} | Preview: ${e.preview}`).join('\n');
  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `You are filtering a CEO's inbox. Return ONLY the numbers of emails that need a human response or action — skip newsletters, FYI updates, automated notifications, receipts, and calendar invites already accepted.

${list}

Reply with just the numbers, comma-separated. Example: 1,3,5`,
    }],
  });
  const text = response.content.find((b) => b.type === 'text');
  const raw = text?.type === 'text' ? text.text.trim() : '';
  const indices = new Set(raw.split(',').map((n) => parseInt(n.trim(), 10) - 1).filter((n) => !isNaN(n)));
  return new Set(emails.filter((_, i) => indices.has(i)).map((e) => e.id));
}

export async function syncMail(): Promise<void> {
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

  console.log(`[syncMail] ${inboxMessages.length} fetched → ${candidates.length} unreplied/non-automated → ${comms.length} actionable`);
  setState({ comms });
}

export async function syncCalendar(): Promise<void> {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);

  const start = now.toISOString();
  const endStr = end.toISOString();

  const data = await graphGet(
    `/me/calendarview?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(endStr)}&$top=20&$orderby=start/dateTime&$select=id,subject,start,end,organizer,location,isAllDay,bodyPreview`,
    { 'Prefer': 'outlook.timezone="Mountain Standard Time"' }
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

  const calEvents = (data.value || []).map((evt, i) => {
    const s = parseDt(evt.start?.dateTime || '');
    const e = parseDt(evt.end?.dateTime || '');
    const startHour = s.hour + s.minute / 60;
    const endHour = e.hour + e.minute / 60;
    const durationHours = endHour > startHour ? endHour - startHour : Math.max(0.5, endHour + 24 - startHour);
    return {
      id: evt.id,
      title: evt.subject || '(no title)',
      start: startHour,
      duration: Math.max(0.5, durationHours),
      color: colorPalette[i % colorPalette.length],
      category: 'Work',
      date: s.day,
      month: s.month,
      year: s.year,
    };
  });

  setState({ calEvents });
}
