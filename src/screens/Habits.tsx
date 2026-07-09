import React, { useState } from 'react';
import { useStore, addHabit, deleteHabit } from '../store/useStore';
import type { Screen } from '../App';

const cardBase: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

interface Props {
  setScreen?: (s: Screen) => void;
}

const R = 22;
const circ = 2 * Math.PI * R;

function RingProgress({ streak, pct, completedToday }: { streak: number; pct: number; completedToday: boolean }) {
  const strokeColor = completedToday ? 'oklch(0.55 0.16 150)' : 'var(--accent)';
  return (
    <svg width={60} height={60} style={{ flexShrink: 0 }}>
      <circle cx="30" cy="30" r={R} fill="none" stroke="var(--line2)" strokeWidth="5" />
      <circle
        cx="30" cy="30" r={R} fill="none"
        stroke={strokeColor}
        strokeWidth="5"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        transform="rotate(-90 30 30)"
      />
      <text x="30" y="34" textAnchor="middle" fontSize="13" fontWeight="600"
        fontFamily="JetBrains Mono, monospace" fill="var(--ink)">
        {streak}
      </text>
    </svg>
  );
}

const DAY_MS = 86_400_000;
const dayStr = (d: Date) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD, browser-local

// Real stats from completion history: last 70 days grid + all-time longest streak
function statsFromHistory(history: string[] | undefined) {
  const done = new Set(history || []);
  const data: boolean[] = [];
  const dates: string[] = [];
  for (let i = 69; i >= 0; i--) {
    const ds = dayStr(new Date(Date.now() - i * DAY_MS));
    dates.push(ds);
    data.push(done.has(ds));
  }
  const sorted = [...done].sort();
  let longest = 0, cur = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    if (prev && (new Date(day).getTime() - new Date(prev).getTime()) === DAY_MS) cur++;
    else cur = 1;
    longest = Math.max(longest, cur);
    prev = day;
  }
  const last30 = data.slice(-30);
  const monthPct = Math.round((last30.filter(Boolean).length / 30) * 100);
  return { data, dates, longest, monthPct, total: done.size };
}

const CADENCES = ['Daily', 'Weekdays', '3x per week', 'Weekly'];

export default function Habits({ setScreen: _setScreen }: Props) {
  const habits = useStore((s) => s.habits);
  const toggleHabitToday = useStore((s) => s.toggleHabitToday);
  const toggleHabitDate = useStore((s) => s.toggleHabitDate);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add-habit form
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCadence, setNewCadence] = useState('Daily');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      await addHabit(newName.trim(), newCadence);
      setNewName('');
      setAddOpen(false);
    } finally { setSaving(false); }
  }

  const bestStreak = habits.reduce((best, h) => (h.streak > (best?.streak ?? 0) ? h : best), null as (typeof habits)[number] | null);

  const unloggedDailyHabits = habits.filter(
    (h) => h.cadence.toLowerCase().includes('daily') && !h.completedToday
  );

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header: add habit + streak highlight */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => setAddOpen((v) => !v)}
          style={{
            padding: '6px 14px', fontSize: 12.5, fontWeight: 600,
            background: addOpen ? 'transparent' : 'var(--accent)',
            color: addOpen ? 'var(--mut)' : '#fff',
            border: addOpen ? '1px solid var(--line)' : 'none',
            borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {addOpen ? 'Cancel' : '+ New habit'}
        </button>
        {bestStreak && bestStreak.streak > 1 && (
          <span style={{ fontSize: 12.5, color: 'var(--mut)' }}>
            🔥 Longest active streak: <strong style={{ color: 'var(--ink)' }}>{bestStreak.name}</strong> — {bestStreak.streak} days
          </span>
        )}
      </div>

      {/* Add habit form */}
      {addOpen && (
        <div style={{ ...cardBase, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAddOpen(false); }}
            placeholder="Habit name (e.g. Morning run)"
            style={{
              flex: 1, minWidth: 200, border: '1px solid var(--line)', borderRadius: 6,
              padding: '7px 10px', fontSize: 13, fontFamily: 'inherit',
              color: 'var(--ink)', background: 'var(--bg)', outline: 'none',
            }}
          />
          <select
            value={newCadence}
            onChange={(e) => setNewCadence(e.target.value)}
            style={{
              border: '1px solid var(--line)', borderRadius: 6, padding: '7px 10px',
              fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg)', outline: 'none',
            }}
          >
            {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || saving}
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 600, background: 'var(--accent)',
              color: '#fff', border: 'none', borderRadius: 6,
              cursor: newName.trim() && !saving ? 'pointer' : 'default',
              opacity: newName.trim() && !saving ? 1 : 0.5, fontFamily: 'inherit',
            }}
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}

      {/* Empty state */}
      {habits.length === 0 && !addOpen && (
        <div style={{ ...cardBase, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🌱</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>No habits yet</div>
          <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.6 }}>
            Add your first habit above — or tell Adler on Telegram, e.g. "track a morning run habit".
            Streaks and history build from the days you actually log.
          </div>
        </div>
      )}

      {/* Habits list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {habits.map((habit) => {
          const isExpanded = expandedId === habit.id;
          const { data, dates, longest, monthPct, total } = statsFromHistory(habit.history);

          return (
            <div key={habit.id} style={{ ...cardBase }}>
              {/* Main row */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : habit.id)}
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  cursor: 'pointer',
                }}
              >
                {/* SVG ring */}
                <RingProgress streak={habit.streak} pct={habit.pct} completedToday={habit.completedToday} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--ink)',
                      marginBottom: 3,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {habit.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--mut)' }}>{habit.cadence}</div>
                </div>

                {/* Heatmap */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 10px)',
                    gridTemplateRows: 'repeat(5, 10px)',
                    gap: 2,
                  }}
                >
                  {habit.heatmap.map((filled, i) => (
                    <div
                      key={i}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: filled ? 'var(--accent)' : 'var(--line2)',
                      }}
                    />
                  ))}
                </div>

                {/* Streak + rate */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>
                    {habit.streak}d
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 2, whiteSpace: 'nowrap' }}>
                    {habit.rate}% this month
                  </div>
                </div>

                {/* Log today button */}
                <div
                  style={{ flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {habit.completedToday ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'oklch(0.45 0.14 150)',
                        background: 'oklch(0.94 0.06 150)',
                        padding: '4px 10px',
                        borderRadius: '10px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Done today ✓
                    </span>
                  ) : (
                    <button
                      onClick={() => toggleHabitToday(habit.id)}
                      style={{
                        padding: '4px 10px',
                        fontSize: 12,
                        border: '1px solid var(--line)',
                        borderRadius: '10px',
                        background: 'transparent',
                        color: 'var(--ink2)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Log today
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded section */}
              {isExpanded && (
                <div
                  style={{
                    borderTop: '1px solid var(--line2)',
                    padding: '14px 16px',
                    background: 'var(--bg)',
                    borderRadius: '0 0 var(--radius-card) var(--radius-card)',
                  }}
                >
                  {/* 10-week heatmap: 70 real days, oldest → today */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Last 10 weeks — tap any day to log or unlog it</div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(14, 14px)',
                        gridTemplateRows: 'repeat(5, 14px)',
                        gap: 3,
                      }}
                    >
                      {data.map((filled, i) => {
                        const ds = dates[i];
                        const label = new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        return (
                          <button
                            key={i}
                            title={`${label} — ${filled ? 'logged (tap to undo)' : 'not logged (tap to log)'}`}
                            onClick={() => toggleHabitDate(habit.id, ds)}
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 2,
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              background: filled ? 'var(--accent)' : 'var(--line2)',
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Stats mini grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div
                      style={{
                        background: 'var(--card)',
                        borderRadius: 6,
                        border: '1px solid var(--line)',
                        padding: '8px 12px',
                      }}
                    >
                      <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Total logged</div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{total}d</div>
                    </div>
                    <div
                      style={{
                        background: 'var(--card)',
                        borderRadius: 6,
                        border: '1px solid var(--line)',
                        padding: '8px 12px',
                      }}
                    >
                      <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Longest streak</div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{longest}d</div>
                    </div>
                    <div
                      style={{
                        background: 'var(--card)',
                        borderRadius: 6,
                        border: '1px solid var(--line)',
                        padding: '8px 12px',
                      }}
                    >
                      <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>This month</div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{monthPct}%</div>
                    </div>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete "${habit.name}" and its history?`)) {
                        deleteHabit(habit.id);
                        setExpandedId(null);
                      }
                    }}
                    style={{
                      padding: '4px 12px',
                      fontSize: 11,
                      background: 'transparent',
                      color: 'var(--p1)',
                      border: '1px solid var(--p1)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Remove habit
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unlogged habits callout */}
      {unloggedDailyHabits.length > 0 && (
        <div
          style={{
            background: 'oklch(0.97 0.04 75)',
            borderRadius: 'var(--radius-card)',
            borderLeft: '3px solid var(--p2)',
            padding: '12px 14px',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 8 }}>
            <strong>{unloggedDailyHabits.length} daily habit{unloggedDailyHabits.length !== 1 ? 's' : ''}</strong> not yet logged today
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unloggedDailyHabits.map((h) => (
              <button
                key={h.id}
                onClick={() => toggleHabitToday(h.id)}
                style={{
                  padding: '3px 10px',
                  fontSize: 12,
                  border: '1px solid var(--p2)',
                  borderRadius: 10,
                  background: 'var(--card)',
                  color: 'var(--ink2)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {h.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
