import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import type { Screen } from '../App';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface HomeProps {
  setScreen: (s: Screen) => void;
}

const cardBase: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
  padding: '16px',
};

const eyebrow: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '10.5px',
  textTransform: 'uppercase',
  letterSpacing: '.11em',
  color: 'var(--faint)',
  marginBottom: '10px',
};

const priorityColor = (p: string) => {
  if (p === 'p1') return 'var(--p1)';
  if (p === 'p2') return 'var(--p2)';
  return 'var(--p3)';
};

function HabitRing({ pct, color }: { pct: number; color: string }) {
  const r = 18, cx = 23, cy = 23;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width="46" height="46" style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line2)" strokeWidth="4" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
    </svg>
  );
}

function BentoTile({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ ...cardBase, ...style, cursor: onClick ? 'pointer' : undefined, transition: 'box-shadow 0.15s, transform 0.15s', boxShadow: hovered && onClick ? '0 4px 16px oklch(0 0 0 / 0.10)' : 'var(--shadow-card)', transform: hovered && onClick ? 'translateY(-1px)' : undefined }}>
      {children}
    </div>
  );
}

function getWeekDays() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return labels.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { label, date: d.getDate(), month: d.getMonth(), fullDate: d };
  });
}

function formatEventTime(start: number) {
  const h = Math.floor(start);
  const m = start % 1 ? '30' : '00';
  const ampm = h < 12 ? 'am' : 'pm';
  return `${h > 12 ? h - 12 : h || 12}:${m}${ampm}`;
}

export default function Home({ setScreen }: HomeProps) {
  const tasks = useStore((s) => s.tasks);
  const habits = useStore((s) => s.habits);
  const goals = useStore((s) => s.goals);
  const books = useStore((s) => s.books);
  const calEvents = useStore((s) => s.calEvents);
  const briefingText = useStore((s) => s.briefingText);
  const briefingNudges = useStore((s) => s.briefingNudges);

  const [refreshing, setRefreshing] = useState(false);

  const now = new Date();
  const todayDate = now.getDate();
  const todayMonth = now.getMonth();
  const weekDays = getWeekDays();

  const todayTasks = tasks.filter((t) => t.column === 'today').slice(0, 4);
  const topHabits = habits.slice(0, 3);
  const readingBooks = books.filter((b) => b.status === 'reading');
  const todayYear = now.getFullYear();
  const todayEvents = calEvents
    .filter((e) => {
      const em = (e as { month?: number }).month;
      const ey = (e as { year?: number }).year;
      if (typeof em === 'number' && typeof ey === 'number') {
        return em === todayMonth + 1 && ey === todayYear && e.date === todayDate;
      }
      return e.date === todayDate;
    })
    .sort((a, b) => a.start - b.start)
    .slice(0, 4);

  async function handleRefreshBriefing() {
    setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/briefing/generate`, { method: 'POST' });
      const data = await res.json() as { briefingText: string; briefingNudges: string[] };
      useStore.setState({ briefingText: data.briefingText, briefingNudges: data.briefingNudges });
    } catch {}
    setRefreshing(false);
  }

  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div style={{ padding: '20px', background: 'var(--bg)', minHeight: '100vh', fontFamily: "'Schibsted Grotesk', sans-serif", color: 'var(--ink)' }}>

      {/* Briefing Card */}
      <div style={{ ...cardBase, padding: '20px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '2px' }}>{greeting}, Jeff</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--faint)' }}>{dateStr}</div>
          </div>
          <button
            onClick={handleRefreshBriefing}
            disabled={refreshing}
            style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid var(--line)', borderRadius: '20px', background: 'var(--card)', color: 'var(--ink2)', cursor: refreshing ? 'default' : 'pointer', fontFamily: 'inherit', opacity: refreshing ? 0.5 : 1 }}
          >
            {refreshing ? 'Generating…' : '↻ Refresh'}
          </button>
        </div>

        {briefingText ? (
          <>
            <p style={{ fontFamily: "'Newsreader', serif", fontSize: '17px', lineHeight: 1.6, color: 'var(--ink)', margin: '12px 0 14px' }}>
              {briefingText}
            </p>
            {briefingNudges.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {briefingNudges.map((nudge, i) => (
                  <span key={i} style={{ background: 'var(--accentbg)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-chip)', padding: '4px 10px', fontSize: '12px', color: 'var(--ink2)' }}>
                    {nudge}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p style={{ fontFamily: "'Newsreader', serif", fontSize: '17px', lineHeight: 1.6, color: 'var(--mut)', margin: '12px 0 0', fontStyle: 'italic' }}>
            Hit refresh to get your briefing from Adler.
          </p>
        )}
      </div>

      {/* Bento Grid */}
      <div style={{ display: 'grid', gridTemplateAreas: `"cal cal tasks habits" "cal cal tasks health" "reading reading finance goals"`, gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'auto auto auto', gap: '12px' }}>

        {/* Calendar */}
        <BentoTile style={{ gridArea: 'cal' }} onClick={() => setScreen('calendar')}>
          <div style={eyebrow}>Calendar</div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '14px' }}>
            {weekDays.map((d) => {
              const isToday = d.date === todayDate && d.month === todayMonth;
              return (
                <div key={d.label} style={{ flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: '4px', background: isToday ? 'var(--ink)' : 'transparent', color: isToday ? '#fff' : 'var(--ink2)' }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: isToday ? 600 : 400 }}>{d.date}</div>
                  <div style={{ fontSize: '10px', color: isToday ? 'rgba(255,255,255,0.7)' : 'var(--faint)', marginTop: '2px' }}>{d.label}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {todayEvents.length > 0 ? todayEvents.map((evt) => (
              <div key={evt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--faint)', minWidth: '58px' }}>{formatEventTime(evt.start)}</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: evt.color, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{evt.title}</span>
              </div>
            )) : (
              <div style={{ fontSize: '12px', color: 'var(--faint)', fontStyle: 'italic' }}>Nothing scheduled today</div>
            )}
          </div>
        </BentoTile>

        {/* Tasks */}
        <BentoTile style={{ gridArea: 'tasks' }} onClick={() => setScreen('todos')}>
          <div style={eyebrow}>Today's Tasks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {todayTasks.length > 0 ? todayTasks.map((task) => (
              <div key={task.id} style={{ borderLeft: `3px solid ${priorityColor(task.priority)}`, paddingLeft: '10px', paddingTop: '6px', paddingBottom: '6px', display: 'flex', flexDirection: 'column', gap: '3px', opacity: task.done ? 0.45 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: priorityColor(task.priority), flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 500, flex: 1, textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</span>
                </div>
                <div style={{ paddingLeft: '13px' }}>
                  <span style={{ fontSize: '10.5px', padding: '1px 5px', borderRadius: '2px', background: 'var(--bg)', border: '1px solid var(--line2)', color: 'var(--mut)' }}>{task.category}</span>
                </div>
              </div>
            )) : (
              <div style={{ fontSize: '12px', color: 'var(--faint)', fontStyle: 'italic' }}>All clear — no tasks today</div>
            )}
          </div>
        </BentoTile>

        {/* Habits */}
        <BentoTile style={{ gridArea: 'habits' }} onClick={() => setScreen('habits')}>
          <div style={eyebrow}>Habits</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {topHabits.map((h) => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <HabitRing pct={h.pct} color={h.completedToday ? 'var(--accent)' : 'var(--p2)'} />
                <div>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink)', fontWeight: 500 }}>{h.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--faint)', fontFamily: "'JetBrains Mono', monospace" }}>{h.streak}d streak{h.completedToday ? ' ✓' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </BentoTile>

        {/* Health — static for now, placeholder */}
        <BentoTile style={{ gridArea: 'health' }} onClick={() => setScreen('health')}>
          <div style={eyebrow}>Health</div>
          <div style={{ fontSize: '12px', color: 'var(--faint)', fontStyle: 'italic' }}>Connect a health source to see stats here.</div>
        </BentoTile>

        {/* Reading */}
        <BentoTile style={{ gridArea: 'reading' }} onClick={() => setScreen('reading')}>
          <div style={eyebrow}>Reading</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {readingBooks.length > 0 ? readingBooks.map((b) => (
              <div key={b.id} style={{ borderLeft: '3px solid var(--accent)', paddingLeft: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '2px' }}>{b.title}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--mut)', marginBottom: '6px' }}>{b.author}</div>
                <div style={{ height: '4px', background: 'var(--line2)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${b.pct}%`, background: 'var(--accent)', borderRadius: '2px' }} />
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--faint)', fontFamily: "'JetBrains Mono', monospace", marginTop: '3px' }}>{b.pct}%{b.chapter ? ` · ${b.chapter}` : ''}</div>
              </div>
            )) : (
              <div style={{ fontSize: '12px', color: 'var(--faint)', fontStyle: 'italic' }}>No books in progress</div>
            )}
          </div>
        </BentoTile>

        {/* Finance — static */}
        <BentoTile style={{ gridArea: 'finance' }} onClick={() => setScreen('finances')}>
          <div style={eyebrow}>Finances</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '20px', fontWeight: 600, color: 'var(--ink)', marginBottom: '2px' }}>$148,200</div>
          <div style={{ fontSize: '12px', color: 'oklch(0.42 0.12 150)', marginBottom: '14px' }}>+1.8% ↑ this month</div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--mut)' }}>Budget spent</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--faint)' }}>$2,043 / $2,500</span>
            </div>
            <div style={{ height: '5px', background: 'var(--line2)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(2043 / 2500) * 100}%`, background: 'var(--accent)', borderRadius: '3px' }} />
            </div>
          </div>
        </BentoTile>

        {/* Goals */}
        <BentoTile style={{ gridArea: 'goals' }} onClick={() => setScreen('goals')}>
          <div style={eyebrow}>Goals</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {goals.map((g) => (
              <div key={g.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--ink2)' }}>{g.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--faint)' }}>{g.pct}%</span>
                </div>
                <div style={{ height: '4px', background: 'var(--line2)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${g.pct}%`, background: g.color || 'var(--accent)', borderRadius: '2px' }} />
                </div>
              </div>
            ))}
          </div>
        </BentoTile>

      </div>
    </div>
  );
}
