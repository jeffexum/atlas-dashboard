// server/sms.ts — SMS channel for Adler via Twilio.
// Inbound: Twilio webhook (signature-validated, owner's number only) → runAdler.
// Outbound: REST API send, long replies split into ≤1500-char parts.

import crypto from 'crypto';
import { runAdler } from './adler.js';

const SID = process.env.TWILIO_ACCOUNT_SID || '';
const AUTH = process.env.TWILIO_AUTH_TOKEN || '';
const FROM = process.env.TWILIO_FROM_NUMBER || '';   // the Twilio number, E.164 e.g. +18885551234
const OWNER = process.env.OWNER_PHONE_NUMBER || '';  // Jeff's cell, E.164

export function smsConfigured(): boolean {
  return !!(SID && AUTH && FROM && OWNER);
}

// Twilio request signature: HMAC-SHA1 of URL + sorted POST params, base64.
export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string): boolean {
  if (!AUTH || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', AUTH).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// SMS has no markdown — strip the formatting Adler writes for Telegram/dashboard.
function toPlainText(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-•]\s*/gm, '- ')
    .trim();
}

export async function sendSms(to: string, body: string): Promise<void> {
  const text = toPlainText(body);
  // Split on paragraph boundaries into ≤1500-char messages (Twilio caps at 1600)
  const parts: string[] = [];
  let cur = '';
  for (const para of text.split('\n\n')) {
    const candidate = cur ? `${cur}\n\n${para}` : para;
    if (candidate.length > 1500 && cur) { parts.push(cur); cur = para; }
    else cur = candidate;
  }
  if (cur) parts.push(cur);

  for (const part of parts.slice(0, 4)) { // hard cap: never blast more than 4 texts
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${SID}:${AUTH}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: FROM, Body: part.slice(0, 1590) }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio send ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// Notify the owner proactively (briefings, alerts) — no-op if SMS not configured.
export async function sendOwnerSms(body: string): Promise<void> {
  if (!smsConfigured()) return;
  await sendSms(OWNER, body);
}

// Handle an inbound SMS webhook body. Returns true if accepted.
export async function handleInboundSms(params: Record<string, string>): Promise<void> {
  const from = params.From || '';
  const body = (params.Body || '').trim();
  if (from !== OWNER) {
    console.warn(`[sms] ignored message from unknown number ${from.slice(0, 6)}…`);
    return;
  }
  if (!body) return;
  try {
    const reply = await runAdler(body);
    await sendSms(from, reply);
  } catch (err) {
    console.error('[sms] Adler error:', err);
    await sendSms(from, 'Something went wrong on my end — try again in a minute.').catch(() => {});
  }
}
