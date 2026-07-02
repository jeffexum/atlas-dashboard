import React from 'react';
import { useStore } from '../store/useStore';
import type { HealthDay } from '../store/useStore';

const cardBase: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

const eyebrow: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
  color: 'var(--faint)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 10,
};

function scoreColor(score?: number): string {
  if (score === undefined) return 'var(--line2)';
  if (score >= 85) return 'oklch(0.55 0.16 150)';
  if (score >= 70) return 'var(--accent)';
  if (score >= 60) return 'var(--p2)';
  return 'var(--p1)';
}

const R = 34;
const CIRC = 2 * Math.PI * R;

function ScoreRing({ label, score }: { label: string; score?: number }) {
  const color = scoreColor(score);
  const pct = (score ?? 0) / 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={88} height={88}>
        <circle cx="44" cy="44" r={R} fill="none" stroke="var(--line2)" strokeWidth="7" />
        <circle
          cx="44" cy="44" r={R} fill="none"
          stroke={color} strokeWidth="7"
          strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)}
          strokeLinecap="round" transform="rotate(-90 44 44)"
        />
        <text x="44" y="50" textAnchor="middle" fontSize="20" fontWeight="700"
          fontFamily="JetBrains Mono, monospace" fill="var(--ink)">
          {score ?? '–'}
        </text>
      </svg>
      <span style={{ fontSize: 12, color: 'var(--mut)', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function TrendBars({ title, days, value, unit, color }: {
  title: string;
  days: HealthDay[];
  value: (d: HealthDay) => number | undefined;
  unit: string;
  color: string;
}) {
  const vals = days.map(value);
  const max = Math.max(...vals.filter((v): v is number => v !== undefined), 1);
  const latest = [...vals].reverse().find((v) => v !== undefined);
  return (
    <div style={{ ...cardBase, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ ...eyebrow, marginBottom: 0 }}>{title}</div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
          {latest !== undefined ? `${latest}${unit}` : '–'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
        {days.map((d, i) => {
          const v = vals[i];
          return (
            <div key={d.date} title={`${d.date}: ${v ?? '–'}${unit}`}
              style={{
                flex: 1,
                height: v !== undefined ? `${Math.max(8, (v / max) * 100)}%` : 4,
                background: v !== undefined ? color : 'var(--line2)',
                borderRadius: 2,
                opacity: i === days.length - 1 ? 1 : 0.55,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function Health() {
  const health = useStore((s) => s.health);

  if (!health.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 16 }}>
        <div style={{ ...cardBase, padding: '48px 56px', textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💍</div>
          <div style={{ fontFamily: 'Newsreader, serif', fontSize: 20, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
            Health
          </div>
          <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.6 }}>
            No Oura data yet. Add your OURA_TOKEN on the server, then data syncs automatically every 2 hours.
          </div>
        </div>
      </div>
    );
  }

  const days = health.slice(-14);
  const latest = health[health.length - 1];
  const latestDate = new Date(`${latest.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const sleepTotal = (latest.deepHours ?? 0) + (latest.remHours ?? 0) + (latest.lightHours ?? 0);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900, margin: '0 auto' }}>
      {/* Today's scores */}
      <div style={{ ...cardBase, padding: '18px 20px' }}>
        <div style={eyebrow}>Oura · {latestDate}</div>
        <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 12 }}>
          <ScoreRing label="Sleep" score={latest.sleepScore} />
          <ScoreRing label="Readiness" score={latest.readinessScore} />
          <ScoreRing label="Activity" score={latest.activityScore} />
        </div>
      </div>

      {/* Last night */}
      <div style={{ ...cardBase, padding: '16px 20px' }}>
        <div style={eyebrow}>Last night</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>
            {latest.sleepHours ?? '–'}h
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--mut)' }}>
            {latest.efficiency !== undefined ? `${latest.efficiency}% efficiency` : ''}
            {latest.restingHR !== undefined ? ` · resting HR ${latest.restingHR}` : ''}
            {latest.hrv !== undefined ? ` · HRV ${latest.hrv}ms` : ''}
          </span>
        </div>
        {/* Stage bar */}
        {sleepTotal > 0 && (
          <>
            <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ width: `${((latest.deepHours ?? 0) / sleepTotal) * 100}%`, background: 'var(--violet)' }} />
              <div style={{ width: `${((latest.remHours ?? 0) / sleepTotal) * 100}%`, background: 'var(--blue)' }} />
              <div style={{ width: `${((latest.lightHours ?? 0) / sleepTotal) * 100}%`, background: 'var(--line)' }} />
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--mut)' }}>
              <span><span style={{ color: 'var(--violet)' }}>●</span> Deep {latest.deepHours}h</span>
              <span><span style={{ color: 'var(--blue)' }}>●</span> REM {latest.remHours}h</span>
              <span><span style={{ color: 'var(--faint)' }}>●</span> Light {latest.lightHours}h</span>
            </div>
          </>
        )}
      </div>

      {/* 14-day trends */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <TrendBars title="Sleep · 14 days" days={days} value={(d) => d.sleepHours} unit="h" color="var(--violet)" />
        <TrendBars title="HRV · 14 days" days={days} value={(d) => d.hrv} unit="ms" color="var(--blue)" />
        <TrendBars title="Resting HR · 14 days" days={days} value={(d) => d.restingHR} unit="" color="var(--p2)" />
        <TrendBars title="Steps · 14 days" days={days} value={(d) => d.steps} unit="" color="var(--accent)" />
      </div>
    </div>
  );
}
