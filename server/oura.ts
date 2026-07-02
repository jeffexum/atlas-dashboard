// server/oura.ts — Oura Ring sync via Personal Access Token (OURA_TOKEN env var)

import { setState } from './state.js';
import type { HealthDay } from './state.js';

const OURA_BASE = 'https://api.ouraring.com/v2/usercollection';

export function isOuraConfigured(): boolean {
  return !!process.env.OURA_TOKEN;
}

async function ouraGet<T>(path: string, start: string, end: string): Promise<T[]> {
  const res = await fetch(`${OURA_BASE}/${path}?start_date=${start}&end_date=${end}`, {
    headers: { Authorization: `Bearer ${process.env.OURA_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Oura API ${path} returned ${res.status}`);
  const json = await res.json() as { data: T[] };
  return json.data || [];
}

interface DailyScore { day: string; score?: number }
interface DailyReadiness extends DailyScore { temperature_deviation?: number }
interface DailyActivity extends DailyScore { steps?: number; active_calories?: number }
interface SleepSession {
  day: string;
  total_sleep_duration?: number;
  deep_sleep_duration?: number;
  rem_sleep_duration?: number;
  light_sleep_duration?: number;
  efficiency?: number;
  average_hrv?: number;
  lowest_heart_rate?: number;
  type?: string;
}

const toH = (sec?: number) => sec === undefined ? undefined : Math.round((sec / 3600) * 10) / 10;

export async function syncOura(): Promise<void> {
  if (!isOuraConfigured()) throw new Error('OURA_TOKEN not configured');

  const end = new Date();
  const start = new Date(end.getTime() - 14 * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const [startStr, endStr] = [fmt(start), fmt(end)];

  const [dailySleep, readiness, activity, sessions] = await Promise.all([
    ouraGet<DailyScore>('daily_sleep', startStr, endStr),
    ouraGet<DailyReadiness>('daily_readiness', startStr, endStr),
    ouraGet<DailyActivity>('daily_activity', startStr, endStr),
    ouraGet<SleepSession>('sleep', startStr, endStr),
  ]);

  const byDay = new Map<string, HealthDay>();
  const day = (d: string): HealthDay => {
    if (!byDay.has(d)) byDay.set(d, { date: d });
    return byDay.get(d)!;
  };

  for (const s of dailySleep) day(s.day).sleepScore = s.score;
  for (const r of readiness) {
    const h = day(r.day);
    h.readinessScore = r.score;
    h.tempDeviation = r.temperature_deviation;
  }
  for (const a of activity) {
    const h = day(a.day);
    h.activityScore = a.score;
    h.steps = a.steps;
    h.activeCalories = a.active_calories;
  }
  // Multiple sessions per day possible (naps) — keep the longest as the night's sleep
  const longest = new Map<string, SleepSession>();
  for (const s of sessions) {
    const cur = longest.get(s.day);
    if (!cur || (s.total_sleep_duration || 0) > (cur.total_sleep_duration || 0)) longest.set(s.day, s);
  }
  for (const [d, s] of longest) {
    const h = day(d);
    h.sleepHours = toH(s.total_sleep_duration);
    h.deepHours = toH(s.deep_sleep_duration);
    h.remHours = toH(s.rem_sleep_duration);
    h.lightHours = toH(s.light_sleep_duration);
    h.efficiency = s.efficiency;
    h.hrv = s.average_hrv;
    h.restingHR = s.lowest_heart_rate;
  }

  const health = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  setState({ health });
  console.log(`[syncOura] ${health.length} days of health data synced`);
}
