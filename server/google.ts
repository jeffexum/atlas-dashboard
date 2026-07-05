// server/google.ts — Google Calendar OAuth2 + sync

import { getState, setState } from './state.js';
import { USER } from './config.js';
import type { CalEvent } from './state.js';
import { markOk, markReauth, markError, isInvalidGrant } from './connhealth.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const _API_BASE = process.env.WEBHOOK_URL || process.env.PUBLIC_API_URL || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || (_API_BASE ? `${_API_BASE}/api/google/callback` : '');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;
const GOOGLE_TOKEN_KEY = 'atlas:googleToken';

interface GoogleToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type: string;
  scope?: string; // space-separated granted scopes
}

let _token: GoogleToken | null = null;

// ── Redis helpers ─────────────────────────────────────────────────────────────

async function saveToken(token: GoogleToken): Promise<void> {
  _token = token;
  if (!REDIS_URL || !REDIS_TOKEN) return;
  await fetch(`${REDIS_URL}/set/${GOOGLE_TOKEN_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(token),
  });
}

export async function loadGoogleToken(): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    const res = await fetch(`${REDIS_URL}/get/${GOOGLE_TOKEN_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await res.json() as { result: string | null };
    if (!json.result) return;
    const parsed = JSON.parse(json.result);
    _token = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    console.log('[google] Token loaded from Redis');
  } catch (err) {
    console.warn('[google] Failed to load token from Redis:', err);
  }
}

// ── OAuth flow ────────────────────────────────────────────────────────────────

export function isGoogleAuthenticated(): boolean {
  return !!_token?.access_token;
}

export function getGoogleAuthUrl(): string {
  if (!GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID not configured');
  if (!GOOGLE_REDIRECT_URI) throw new Error('GOOGLE_REDIRECT_URI (or WEBHOOK_URL/PUBLIC_API_URL) not configured');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code: string): Promise<void> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('Google OAuth not configured');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope?: string;
  };
  await saveToken({
    access_token: data.access_token,
    // Google only returns a refresh_token on first consent; keep the existing one if omitted.
    refresh_token: data.refresh_token ?? _token?.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
    token_type: data.token_type,
    scope: data.scope ?? _token?.scope,
  });
  markOk('google');
  console.log('[google] OAuth token obtained');
}

export function hasGmailScope(): boolean {
  return !!_token?.scope?.includes('gmail.readonly');
}

export function hasGmailSendScope(): boolean {
  return !!_token?.scope?.includes('gmail.send');
}

export async function getGoogleAccessToken(): Promise<string> {
  return getAccessToken();
}

async function getAccessToken(): Promise<string> {
  if (!_token) throw new Error('Google not authenticated');
  if (Date.now() < _token.expires_at) return _token.access_token;
  if (!_token.refresh_token) throw new Error('Google token expired, no refresh token');
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('Google OAuth not configured');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: _token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Testing-mode Google OAuth apps expire refresh tokens after 7 days → invalid_grant.
    if (isInvalidGrant(text) || res.status === 400) {
      markReauth('google', 'invalid_grant');
      console.error('Google refresh token is dead — user must reconnect (publish the OAuth app to stop 7-day expiry). Surfaced in setup status.');
    } else {
      markError('google', `refresh ${res.status}`);
    }
    throw new Error(`Token refresh failed: ${res.status}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  _token = {
    ..._token,
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  await saveToken(_token);
  markOk('google');
  return _token.access_token;
}

// ── Calendar sync ─────────────────────────────────────────────────────────────

interface GCalEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
}

const COLOR_MAP: Record<string, string> = {
  '1': '#a4bdfc', '2': '#7ae7bf', '3': '#dbadff', '4': '#ff887c',
  '5': '#fbd75b', '6': '#ffb878', '7': '#46d6db', '8': '#e1e1e1',
  '9': '#5484ed', '10': '#51b749', '11': '#dc2127',
};

export async function syncGoogleCalendar(): Promise<void> {
  const token = await getAccessToken();

  // Fetch next 14 days of events
  const now = new Date();
  // Start of yesterday so today's earlier events stay visible after midday syncs
  const timeMin = new Date(now.getTime() - 30 * 60 * 60_000).toISOString();
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const timeMax = twoWeeks.toISOString();

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '100');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API error: ${res.status} ${text}`);
  }

  const data = await res.json() as { items: GCalEvent[] };
  const items = data.items || [];

  const calEvents: CalEvent[] = items.map((item) => {
    const isAllDay = !item.start.dateTime;
    const startStr = item.start.dateTime || item.start.date || '';
    const endStr = item.end.dateTime || item.end.date || '';
    // Date-only strings parse as UTC midnight; append local time to keep the day right
    const startDate = new Date(isAllDay ? `${startStr}T00:00:00` : startStr);
    const endDate = new Date(isAllDay ? `${endStr}T00:00:00` : endStr);

    // Server runs in UTC — convert timed events to Denver local time
    const denver = new Intl.DateTimeFormat('en-US', {
      timeZone: USER.tz, hour: 'numeric', minute: 'numeric', day: 'numeric', month: 'numeric', year: 'numeric', hour12: false,
    }).formatToParts(startDate).reduce<Record<string, number>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = parseInt(p.value, 10);
      return acc;
    }, {});

    const startHour = isAllDay ? 8 : (denver.hour % 24) + denver.minute / 60;
    const durationMs = endDate.getTime() - startDate.getTime();
    // All-day events render as a 1h banner at 8am instead of a 24h+ block
    const duration = isAllDay ? 1 : Math.min(12, Math.max(0.25, durationMs / (1000 * 60 * 60)));

    return {
      id: `gcal-${item.id}`,
      title: isAllDay ? `📅 ${item.summary || '(No title)'}` : (item.summary || '(No title)'),
      start: startHour,
      duration: Math.round(duration * 4) / 4,
      color: item.colorId ? (COLOR_MAP[item.colorId] || '#4285f4') : '#4285f4',
      category: 'Personal',
      date: isAllDay ? startDate.getDate() : denver.day,
      month: isAllDay ? startDate.getMonth() + 1 : denver.month,
      year: isAllDay ? startDate.getFullYear() : denver.year,
      source: 'personal' as const,
    };
  });

  // Merge: keep non-Google events, replace all gcal- events with fresh ones
  const s = getState();
  const nonGoogle = s.calEvents.filter((e) => !e.id.startsWith('gcal-'));
  setState({ calEvents: [...nonGoogle, ...calEvents] });
  console.log(`[syncGoogleCalendar] ${calEvents.length} events synced`);
}
