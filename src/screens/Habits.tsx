import React, { useState } from 'react';
import { useStore } from '../store/useStore';
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

export default function Habits({ setScreen: _setScreen }: Props) {
  const habits = useStore((s) => s.habits);
  const toggleHabitToday = useStore((s) => s.toggleHabitToday);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cadenceEdits, setCadenceEdits] = useState<Record<string, string>>({});

  function getExpandedStats(heatmap: boolean[]) {
    // Extend to 50 squares
    const data: boolean[] = [];
    for (let i = 0; i < 50; i++) {
      data.push(heatmap[i % heatmap.length]);
    }
    // Longest streak
    let longest = 0;
    let current = 0;
    for (const v of data) {
      if (v) { current++; longest = Math.max(longest, current); }
      else current = 0;
    }
    // This month pct (last 30 squares)
    const monthSlice = data.slice(Math.max(0, data.length - 30));
    const monthPct = Math.round((monthSlice.filter(Boolean).length / monthSlice.length) * 100);
    return { data, longest, monthPct };
  }

  const unloggedDailyHabits = habits.filter(
    (h) => h.cadence.toLowerCase().includes('daily') && !h.completedToday
  );

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Coach callout */}
      <div
        style={{
          background: 'var(--accentbg)',
          borderRadius: 'var(--radius-card)',
          borderLeft: '3px solid var(--accent)',
          padding: '12px 14px',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }}>◎</span>
        <div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Scout
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink2)' }}>
            Your reading streak is at 21 days — your longest this year! Consider adding a morning
            journaling habit to pair with meditation.
          </div>
        </div>
      </div>

      {/* Habits list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {habits.map((habit) => {
          const isExpanded = expandedId === habit.id;
          const { data, longest, monthPct } = getExpandedStats(habit.heatmap);

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
                  {/* 10-week heatmap: 50 squares, 10 cols x 5 rows */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>10-week history</div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(10, 12px)',
                        gridTemplateRows: 'repeat(5, 12px)',
                        gap: 3,
                      }}
                    >
                      {data.map((filled, i) => (
                        <div
                          key={i}
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 2,
                            background: filled ? 'var(--accent)' : 'var(--line2)',
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Stats mini grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
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

                  {/* Edit cadence */}
                  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--mut)' }}>Cadence:</span>
                    <input
                      type="text"
                      value={cadenceEdits[habit.id] ?? habit.cadence}
                      onChange={(e) => setCadenceEdits((prev) => ({ ...prev, [habit.id]: e.target.value }))}
                      style={{
                        border: '1px solid var(--line)',
                        borderRadius: 4,
                        padding: '3px 8px',
                        fontSize: 12,
                        fontFamily: 'inherit',
                        color: 'var(--ink)',
                        background: 'var(--card)',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* Remove button */}
                  <button
                    disabled
                    title="Coming soon"
                    style={{
                      padding: '4px 12px',
                      fontSize: 11,
                      background: 'transparent',
                      color: 'var(--faint)',
                      border: '1px solid var(--line2)',
                      borderRadius: 4,
                      cursor: 'not-allowed',
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
