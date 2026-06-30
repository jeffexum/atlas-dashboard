import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import type { Screen } from '../App';

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
  const r = 18;
  const cx = 23;
  const cy = 23;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct);

  return (
    <svg width="46" height="46" style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line2)" strokeWidth="4" />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
      />
    </svg>
  );
}

function BentoTile({
  children,
  style,
  onClick,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...cardBase,
        ...style,
        cursor: onClick ? 'pointer' : undefined,
        transition: 'box-shadow 0.15s, transform 0.15s',
        boxShadow: hovered && onClick ? '0 4px 16px oklch(0 0 0 / 0.10)' : 'var(--shadow-card)',
        transform: hovered && onClick ? 'translateY(-1px)' : undefined,
      }}
    >
      {children}
    </div>
  );
}

export default function Home({ setScreen }: HomeProps) {
  const tasks = useStore((s) => s.tasks);
  const todayTasks = tasks.filter((t) => t.column === 'today').slice(0, 4);

  const nudges = [
    '✓ Budget sign-off needed',
    '◷ Focus block added',
    '! 2 P1 messages',
    '✓ Dentist added from inbox',
  ];

  const weekDays = [
    { label: 'Mon', date: 23 },
    { label: 'Tue', date: 24 },
    { label: 'Wed', date: 25 },
    { label: 'Thu', date: 26 },
    { label: 'Fri', date: 27 },
    { label: 'Sat', date: 28 },
    { label: 'Sun', date: 29 },
  ];
  const today = 29;

  const agenda = [
    { time: '9:00am', title: 'Team standup' },
    { time: '11:00am', title: 'Focus block' },
    { time: '3:00pm', title: 'Q2 Review ★' },
  ];

  const habits = [
    { name: 'Morning run', streak: 12, pct: 0.8 },
    { name: 'Meditate', streak: 5, pct: 0.67 },
    { name: 'Read', streak: 21, pct: 0.9 },
  ];

  const healthStats = [
    { label: 'Sleep', value: '7h 24m', delta: '+18min', positive: true },
    { label: 'Steps', value: '8,432', delta: '-1,568', positive: false },
    { label: 'Active', value: '47 min', delta: '+12min', positive: true },
    { label: 'HRV', value: '58ms', delta: '+3ms', positive: true },
  ];

  const books = [
    { title: 'The Creative Act', author: 'Rick Rubin', pct: 68 },
    { title: 'Shape Up', author: 'Ryan Singer', pct: 34 },
  ];

  const goals = [
    { name: 'Run 500 miles', pct: 38 },
    { name: 'Read 24 books', pct: 54 },
    { name: 'Save $20k', pct: 61 },
    { name: 'Side project', pct: 25 },
  ];

  return (
    <div style={{ padding: '20px', background: 'var(--bg)', minHeight: '100vh', fontFamily: "'Schibsted Grotesk', sans-serif", color: 'var(--ink)' }}>
      {/* Briefing Card */}
      <div style={{ ...cardBase, padding: '20px', marginBottom: '12px' }}>
        <p style={{ fontFamily: "'Newsreader', serif", fontSize: '18px', lineHeight: 1.55, color: 'var(--ink)', margin: 0, marginBottom: '14px' }}>
          You have <mark style={{ background: 'var(--accentbg)', color: 'var(--ink)', borderRadius: '2px', padding: '0 3px' }}>4 tasks today</mark>, including{' '}
          <mark style={{ background: 'var(--accentbg)', color: 'var(--ink)', borderRadius: '2px', padding: '0 3px' }}>2 urgent items</mark>. Your 3pm Q2 Review needs prep — Scout added a focus block.{' '}
          <mark style={{ background: 'var(--accentbg)', color: 'var(--ink)', borderRadius: '2px', padding: '0 3px' }}>Mark Johnson</mark> needs your sign-off on the budget by EOD.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {nudges.map((nudge, i) => (
            <span
              key={i}
              style={{
                background: 'var(--accentbg)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius-chip)',
                padding: '4px 10px',
                fontSize: '12px',
                color: 'var(--ink2)',
                fontFamily: "'Schibsted Grotesk', sans-serif",
              }}
            >
              {nudge}
            </span>
          ))}
        </div>
      </div>

      {/* Bento Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateAreas: `
            "cal cal tasks habits"
            "cal cal tasks health"
            "reading reading finance goals"
          `,
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridTemplateRows: 'auto auto auto',
          gap: '12px',
        }}
      >
        {/* Calendar */}
        <BentoTile style={{ gridArea: 'cal' }} onClick={() => setScreen('calendar')}>
          <div style={eyebrow}>Calendar</div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '14px' }}>
            {weekDays.map((d) => {
              const isToday = d.date === today;
              return (
                <div
                  key={d.date}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '6px 4px',
                    borderRadius: '4px',
                    background: isToday ? 'var(--ink)' : 'transparent',
                    color: isToday ? '#fff' : 'var(--ink2)',
                  }}
                >
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: isToday ? 600 : 400 }}>{d.date}</div>
                  <div style={{ fontSize: '10px', color: isToday ? 'rgba(255,255,255,0.7)' : 'var(--faint)', marginTop: '2px' }}>{d.label}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {agenda.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--faint)', minWidth: '58px' }}>{item.time}</span>
                <span style={{ fontSize: '13px', color: 'var(--ink2)' }}>{item.title}</span>
              </div>
            ))}
          </div>
        </BentoTile>

        {/* Tasks */}
        <BentoTile style={{ gridArea: 'tasks' }} onClick={() => setScreen('todos')}>
          <div style={eyebrow}>Today's Tasks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {todayTasks.map((task) => (
              <div
                key={task.id}
                style={{
                  borderLeft: `3px solid ${priorityColor(task.priority)}`,
                  paddingLeft: '10px',
                  paddingTop: '6px',
                  paddingBottom: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: priorityColor(task.priority), flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 500, flex: 1 }}>{task.title}</span>
                </div>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center', paddingLeft: '13px' }}>
                  <span style={{ fontSize: '10.5px', padding: '1px 5px', borderRadius: '2px', background: 'var(--bg)', border: '1px solid var(--line2)', color: 'var(--mut)' }}>
                    {task.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </BentoTile>

        {/* Habits */}
        <BentoTile style={{ gridArea: 'habits' }} onClick={() => setScreen('habits')}>
          <div style={eyebrow}>Habits</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {habits.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <HabitRing pct={h.pct} color="var(--accent)" />
                <div>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink)', fontWeight: 500 }}>{h.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--faint)', fontFamily: "'JetBrains Mono', monospace" }}>{h.streak}d streak</div>
                </div>
              </div>
            ))}
          </div>
        </BentoTile>

        {/* Health */}
        <BentoTile style={{ gridArea: 'health' }} onClick={() => setScreen('health')}>
          <div style={eyebrow}>Health</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {healthStats.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--mut)' }}>{s.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12.5px', color: 'var(--ink)', fontWeight: 500 }}>{s.value}</span>
                  <span
                    style={{
                      fontSize: '10.5px',
                      padding: '1px 5px',
                      borderRadius: '2px',
                      background: s.positive ? 'oklch(0.94 0.06 150)' : 'oklch(0.95 0.05 27)',
                      color: s.positive ? 'oklch(0.42 0.12 150)' : 'var(--p1)',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {s.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </BentoTile>

        {/* Reading */}
        <BentoTile style={{ gridArea: 'reading' }} onClick={() => setScreen('reading')}>
          <div style={eyebrow}>Reading</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {books.map((b, i) => (
              <div key={i} style={{ borderLeft: `3px solid var(--accent)`, paddingLeft: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '2px' }}>{b.title}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--mut)', marginBottom: '6px' }}>{b.author}</div>
                <div style={{ height: '4px', background: 'var(--line2)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${b.pct}%`, background: 'var(--accent)', borderRadius: '2px' }} />
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--faint)', fontFamily: "'JetBrains Mono', monospace", marginTop: '3px' }}>{b.pct}%</div>
              </div>
            ))}
          </div>
        </BentoTile>

        {/* Finance */}
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
            {goals.map((g, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--ink2)' }}>{g.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--faint)' }}>{g.pct}%</span>
                </div>
                <div style={{ height: '4px', background: 'var(--line2)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${g.pct}%`, background: 'var(--accent)', borderRadius: '2px' }} />
                </div>
              </div>
            ))}
          </div>
        </BentoTile>
      </div>
    </div>
  );
}
