// server/outlook.ts — Microsoft Graph OAuth2 + mail/calendar sync

import { getState, setState } from './state.js';

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

// In-memory token store (survives restarts only via re-auth)
let tokenData: TokenData | null = null;

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

async function graphGet(path: string): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph API ${path} returned ${res.status}`);
  return res.json();
}

interface GraphMessage {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  bodyPreview?: string;
  isRead?: boolean;
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

export async function syncMail(): Promise<void> {
  const data = await graphGet('/me/mailFolders/inbox/messages?$top=20&$orderby=receivedDateTime%20desc&$select=id,subject,from,receivedDateTime,bodyPreview,isRead&$filter=inferenceClassification%20eq%20%27focused%27') as { value: GraphMessage[] };

  const priorities = ['p1', 'p2', 'p3'] as const;

  const comms = (data.value || []).map((msg, i) => ({
    id: msg.id,
    source: 'email' as const,
    who: msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || 'Unknown',
    subject: msg.subject || '(no subject)',
    preview: msg.bodyPreview?.slice(0, 120) || '',
    time: fmtRelative(msg.receivedDateTime),
    priority: priorities[Math.min(i, 2)],
    status: 'open' as const,
  }));

  setState({ comms });
}

export async function syncCalendar(): Promise<void> {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);

  const start = now.toISOString();
  const endStr = end.toISOString();

  const data = await graphGet(
    `/me/calendarview?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(endStr)}&$top=20&$orderby=start/dateTime&$select=id,subject,start,end,organizer,location,isAllDay,bodyPreview`
  ) as { value: GraphEvent[] };

  const colorPalette = ['var(--blue)', 'var(--violet)', 'var(--accent)', 'var(--warm)', 'var(--p1)'];

  const calEvents = (data.value || []).map((evt, i) => {
    const startDate = new Date(evt.start?.dateTime || '');
    const endDate = new Date(evt.end?.dateTime || '');
    const startHour = startDate.getHours() + startDate.getMinutes() / 60;
    const durationHours = (endDate.getTime() - startDate.getTime()) / 3600000;
    return {
      id: evt.id,
      title: evt.subject || '(no title)',
      start: startHour,
      duration: Math.max(0.5, durationHours),
      color: colorPalette[i % colorPalette.length],
      category: 'Work',
      date: startDate.getDate(),
    };
  });

  setState({ calEvents });
}
