// server/gmail.ts — Gmail as a mail source: sync inbox, reply in-thread, send.
// Uses the Google OAuth token from google.ts (requires gmail.readonly + gmail.send
// scopes — granted on re-connect after these scopes were added).

import { getState, setState } from './state.js';
import type { Comm } from './state.js';
import { getGoogleAccessToken, hasGmailScope, isGoogleAuthenticated } from './google.js';
import { isAutomated, scoreEmailsWithAI, fmtRelative } from './outlook.js';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function isGmailConnected(): boolean {
  return isGoogleAuthenticated() && hasGmailScope();
}

async function gmailGet<T>(path: string): Promise<T> {
  const token = await getGoogleAccessToken();
  const res = await fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail API ${path.split('?')[0]} returned ${res.status}`);
  return res.json() as Promise<T>;
}

interface GmailHeader { name: string; value: string }
interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
}

const b64Decode = (data: string) => Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
const b64UrlEncode = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function header(msg: GmailMessage, name: string): string {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

// Prefer text/plain; fall back to stripped text/html
function extractBody(part?: GmailPart): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return b64Decode(part.body.data);
  if (part.parts) {
    for (const p of part.parts) {
      const text = extractBody(p);
      if (text) return text;
    }
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return b64Decode(part.body.data)
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/\s{2,}/g, '\n').trim();
  }
  return '';
}

const parseFrom = (from: string): { name: string; email: string } => {
  const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim() || m[2], email: m[2] };
  return { name: from, email: from };
};

export async function syncGmail(): Promise<void> {
  if (!isGmailConnected()) throw new Error('Gmail not connected (re-connect Google to grant mail access)');

  const list = await gmailGet<{ messages?: { id: string }[] }>(
    `/messages?q=${encodeURIComponent('in:inbox -category:promotions -category:social newer_than:30d')}&maxResults=40`
  );
  const ids = (list.messages || []).map((m) => m.id);

  const messages: GmailMessage[] = [];
  for (const id of ids) {
    try {
      messages.push(await gmailGet<GmailMessage>(`/messages/${id}?format=full`));
    } catch { /* skip unfetchable */ }
  }

  const candidates = messages.filter((m) => {
    const { email } = parseFrom(header(m, 'From'));
    return !isAutomated(email, header(m, 'Subject'));
  });

  const actionable = await scoreEmailsWithAI(candidates.map((m) => ({
    id: m.id,
    from: header(m, 'From'),
    subject: header(m, 'Subject'),
    preview: m.snippet || '',
  })));

  const comms: Comm[] = candidates
    .filter((m) => actionable.has(m.id))
    .map((m, idx) => {
      const from = parseFrom(header(m, 'From'));
      const body = extractBody(m.payload).slice(0, 3000);
      return {
        id: `gm-${m.id}`,
        source: 'email' as const,
        who: from.name,
        email: from.email,
        subject: header(m, 'Subject') || '(no subject)',
        preview: (m.snippet || body).slice(0, 200),
        body,
        time: fmtRelative(m.internalDate ? new Date(parseInt(m.internalDate, 10)).toISOString() : undefined),
        priority: (idx < 2 ? 'p1' : idx < 6 ? 'p2' : 'p3') as Comm['priority'],
        status: 'open' as const,
      };
    });

  // Merge: keep Outlook comms and any prior non-open statuses on Gmail comms
  const prior = getState().comms;
  const priorStatus = new Map(prior.map((c) => [c.id, c.status]));
  const outlookComms = prior.filter((c) => !c.id.startsWith('gm-'));
  const merged = [
    ...outlookComms,
    ...comms.map((c) => {
      const p = priorStatus.get(c.id);
      return p && p !== 'open' ? { ...c, status: p } : c;
    }),
  ];
  console.log(`[syncGmail] ${messages.length} fetched → ${candidates.length} non-automated → ${comms.length} actionable`);
  setState({ comms: merged });
}

export async function fetchGmailBody(commId: string): Promise<string> {
  const id = commId.replace(/^gm-/, '');
  const msg = await gmailGet<GmailMessage>(`/messages/${id}?format=full`);
  return extractBody(msg.payload) || msg.snippet || '(no body)';
}

// Reply within the Gmail thread — recipients and threading headers derived
// from the original message; replyAll includes original To/Cc minus self.
export async function replyGmail(commId: string, body: string, replyAll = false): Promise<void> {
  const id = commId.replace(/^gm-/, '');
  const original = await gmailGet<GmailMessage>(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Message-ID`);

  const me = await gmailGet<{ emailAddress: string }>('/profile');
  const fromAddr = parseFrom(header(original, 'From')).email;
  const subject = header(original, 'Subject');
  const messageId = header(original, 'Message-ID');

  const to = fromAddr;
  let cc = '';
  if (replyAll) {
    const others = [header(original, 'To'), header(original, 'Cc')]
      .filter(Boolean).join(', ')
      .split(',').map((a) => a.trim()).filter((a) => a && !a.includes(me.emailAddress));
    cc = others.join(', ');
  }

  const raw = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    `Subject: ${subject.startsWith('Re:') ? subject : `Re: ${subject}`}`,
    messageId ? `In-Reply-To: ${messageId}` : '',
    messageId ? `References: ${messageId}` : '',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].filter((l) => l !== '').join('\r\n');

  const token = await getGoogleAccessToken();
  const res = await fetch(`${GMAIL}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: b64UrlEncode(raw), threadId: original.threadId }),
  });
  if (!res.ok) throw new Error(`Gmail send returned ${res.status}: ${await res.text()}`);
}

export async function sendGmail(to: string, subject: string, body: string): Promise<void> {
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n');
  const token = await getGoogleAccessToken();
  const res = await fetch(`${GMAIL}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: b64UrlEncode(raw) }),
  });
  if (!res.ok) throw new Error(`Gmail send returned ${res.status}: ${await res.text()}`);
}
