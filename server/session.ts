// server/session.ts — real login: password → HMAC-signed httpOnly session cookie.
//
// Replaces the old scheme of baking a shared secret into the public frontend
// bundle (anyone could read it from the JS). The password is never shipped to the
// client; the server mints a stateless signed token and stores it in an httpOnly
// cookie the browser can't read from script.

import crypto from 'crypto';

export const COOKIE_NAME = 'atlas_session';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;

// Signing secret for session tokens; falls back to ATLAS_SECRET so existing
// single-secret deploys keep working. Login password is separate.
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.ATLAS_SECRET || '';
export const LOGIN_PASSWORD = process.env.ATLAS_PASSWORD || '';

function sign(payload: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

function timingEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Token = "<expiryMs>.<hmac>" — stateless, self-verifying, tamper-evident.
export function mintToken(ttlMs = THIRTY_DAYS_MS): string {
  const exp = Date.now() + ttlMs;
  return `${exp}.${sign(String(exp))}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token || !SESSION_SECRET) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const exp = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!timingEqual(mac, sign(exp))) return false;
  const expNum = Number(exp);
  return Number.isFinite(expNum) && expNum > Date.now();
}

export function verifyPassword(candidate: string | undefined): boolean {
  if (!LOGIN_PASSWORD || !candidate) return false;
  // Compare hashes so length isn't leaked and comparison is constant-time.
  const h = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
  return timingEqual(h(candidate), h(LOGIN_PASSWORD));
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function sessionCookie(token: string): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=None', // frontend and API are on different subdomains (cross-site)
    `Max-Age=${Math.floor(THIRTY_DAYS_MS / 1000)}`,
  ];
  return attrs.join('; ');
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

export function loginConfigured(): boolean {
  return !!(LOGIN_PASSWORD && SESSION_SECRET);
}
