// server/schedule.ts — meeting-slot suggestions from the merged (work + personal)
// calendar, plus recipient-timezone inference for the draft composer's scheduler pane.
//
// Read-only by design: suggesting times in an email needs no write scopes.
// Rules (Jeff's standing orders, v1): workday 9am–6pm local, 15-min buffer around
// existing events, 30-min granularity, weekdays only.

import Anthropic from '@anthropic-ai/sdk';
import { getState } from './state.js';
import { MODELS } from './models.js';
import { trackModelCall } from './audit.js';
import { USER } from './config.js';

const WORKDAY_START = 9; // local hours
const WORKDAY_END = 18;
const BUFFER = 0.25; // 15 min either side of busy blocks
const GRAN = 0.5; // 30-min slot grid

interface BusyBlock { start: number; end: number; title: string }
interface Slot { startHour: number; epoch: number; label: string }
export interface DaySuggestion {
  date: string; // YYYY-MM-DD local
  label: string; // "Mon Jul 6"
  busy: BusyBlock[];
  slots: Slot[];
}

// Epoch (ms) for a local wall-clock time in USER.tz, DST-safe.
function localToEpoch(y: number, mo: number, d: number, hourFloat: number): number {
  const h = Math.floor(hourFloat);
  const min = Math.round((hourFloat - h) * 60);
  // Start from the naive UTC guess, then correct by the zone offset at that moment (twice, for DST edges).
  let guess = Date.UTC(y, mo - 1, d, h, min);
  for (let i = 0; i < 2; i++) {
    const asLocal = new Date(guess).toLocaleString('en-US', { timeZone: USER.tz, hour12: false });
    const m = asLocal.match(/(\d+)\/(\d+)\/(\d+),? (\d+):(\d+)/);
    if (!m) break;
    const gotten = Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), Number(m[4]) % 24, Number(m[5]));
    guess += Date.UTC(y, mo - 1, d, h, min) - gotten;
  }
  return guess;
}

function fmtHour(hourFloat: number): string {
  const h = Math.floor(hourFloat);
  const min = hourFloat % 1 ? ':30' : ':00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${min} ${ampm}`;
}

// Score a slot: earlier days win; within a day prefer mid-morning and mid-afternoon.
function slotScore(dayOffset: number, startHour: number): number {
  let s = 100 - dayOffset * 10;
  if (startHour >= 10 && startHour < 12) s += 4;
  else if (startHour >= 14 && startHour < 16) s += 3;
  else if (startHour < 9.5) s -= 3; // right at the morning boundary
  return s;
}

export function suggestSlots(durationMin = 30, numDays = 5): {
  tz: string; days: DaySuggestion[]; suggested: Array<Slot & { date: string; label2: string }>;
} {
  const st = getState();
  const durH = durationMin / 60;
  const now = new Date();
  const days: DaySuggestion[] = [];
  const allScored: Array<Slot & { date: string; label2: string; score: number }> = [];

  const localNow = new Date(now.toLocaleString('en-US', { timeZone: USER.tz }));
  let cursor = new Date(localNow);
  let dayOffset = 0;

  while (days.length < numDays && dayOffset < 14) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      const y = cursor.getFullYear();
      const mo = cursor.getMonth() + 1;
      const d = cursor.getDate();
      const isToday = dayOffset === 0;

      const busy: BusyBlock[] = st.calEvents
        .filter((e) => e.date === d && (e.month === undefined || e.month === mo) && (e.year === undefined || e.year === y) && !e.title.startsWith('📅'))
        .map((e) => ({ start: e.start, end: e.start + e.duration, title: e.title }))
        .sort((a, b) => a.start - b.start);

      const slots: Slot[] = [];
      const earliest = isToday ? Math.max(WORKDAY_START, localNow.getHours() + 1.5) : WORKDAY_START;
      for (let h = Math.ceil(earliest / GRAN) * GRAN; h + durH <= WORKDAY_END; h += GRAN) {
        const conflict = busy.some((b) => h < b.end + BUFFER && h + durH > b.start - BUFFER);
        if (conflict) continue;
        const slot: Slot = { startHour: h, epoch: localToEpoch(y, mo, d, h), label: fmtHour(h) };
        slots.push(slot);
      }

      const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayLabel = cursor.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      days.push({ date: dateStr, label: dayLabel, busy, slots });
      for (const s of slots) {
        allScored.push({ ...s, date: dateStr, label2: `${dayLabel}, ${fmtHour(s.startHour)}–${fmtHour(s.startHour + durH)}`, score: slotScore(dayOffset, s.startHour) });
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60_000);
    dayOffset++;
  }

  // Top 3 spread across different days where possible
  const suggested: typeof allScored = [];
  for (const s of allScored.sort((a, b) => b.score - a.score)) {
    if (suggested.length >= 3) break;
    if (suggested.filter((x) => x.date === s.date).length >= 2) continue;
    if (suggested.some((x) => x.date === s.date && Math.abs(x.startHour - s.startHour) < 2)) continue;
    suggested.push(s);
  }

  return { tz: USER.tz, days, suggested: suggested.map(({ score: _s, ...rest }) => rest) };
}

// Infer the recipient's IANA timezone from an email via the cheap model.
export async function guessTimezone(commId: string): Promise<string | null> {
  const comm = getState().comms.find((c) => c.id === commId);
  if (!comm) return null;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const resp = await client.messages.create({
      model: MODELS.cheap,
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: `Infer the sender's IANA timezone from this email. Use signature (city, phone area code), company domain, and content clues. Reply with ONLY an IANA timezone string (e.g. America/New_York) or UNKNOWN.\n\nFrom: ${comm.who} <${comm.email || '?'}>\nSubject: ${comm.subject}\nBody:\n${(comm.body || comm.preview || '').slice(0, 1500)}`,
      }],
    });
    trackModelCall('schedule-tz-guess', resp.model, resp.usage).catch(() => {});
    const text = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : '';
    if (!text || text.includes('UNKNOWN') || !/^[A-Za-z_]+\/[A-Za-z_/]+$/.test(text)) return null;
    // Validate it's a real zone
    try { new Date().toLocaleString('en-US', { timeZone: text }); } catch { return null; }
    return text;
  } catch {
    return null;
  }
}
