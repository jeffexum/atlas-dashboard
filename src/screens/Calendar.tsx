import React, { useState } from 'react';
import { useStore } from '../store/useStore';

const cardBase: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

const eventBgMap: Record<string, string> = {
  'var(--blue)': 'rgba(80,120,210,0.12)',
  'var(--violet)': 'rgba(80,60,180,0.12)',
  'var(--warm)': 'rgba(80,90,170,0.12)',
  'var(--accent)': 'rgba(40,140,100,0.12)',
};

function formatHourLabel(h: number): string {
  if (h === 12) return '12pm';
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}

function formatEventTime(start: number, duration: number): string {
  const toTime = (t: number) => {
    const h = Math.floor(t);
    const m = Math.round((t - h) * 60);
    const suffix = h < 12 ? 'am' : 'pm';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${m.toString().padStart(2, '0')}${suffix}`;
  };
  const end = start + duration;
  const startStr = toTime(start).replace(/(am|pm)$/, '');
  const endStr = toTime(end);
  return `${startStr}–${endStr}`;
}

const HOUR_HEIGHT = 44;
const START_HOUR = 7;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;

// Dynamic current month
const _now = new Date();
const _curYear = _now.getFullYear();
const _curMonth = _now.getMonth(); // 0-indexed
const daysInMonth = new Date(_curYear, _curMonth + 1, 0).getDate();
const month1DayOfWeek = new Date(_curYear, _curMonth, 1).getDay(); // 0=Sun
const MONTH_NAME = _now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const COLOR_OPTIONS = [
  { label: 'Blue', value: 'var(--blue)', hex: '#60a5fa' },
  { label: 'Violet', value: 'var(--violet)', hex: '#a78bfa' },
  { label: 'Green', value: 'var(--accent)', hex: '#4ade80' },
  { label: 'Warm', value: 'var(--warm)', hex: '#fb923c' },
];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Calendar() {
  const calEvents = useStore((s) => s.calEvents);
  const calNote = useStore((s) => s.calNote);
  const addCalEvent = useStore((s) => s.addCalEvent);
  const updateCalNote = useStore((s) => s.updateCalNote);
  const addTask = useStore((s) => s.addTask);

  const [selectedDay, setSelectedDay] = useState(_now.getDate());
  const [syncing, setSyncing] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Add event form state
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [addEventHour, setAddEventHour] = useState(9);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventCategory, setNewEventCategory] = useState('Work');
  const [newEventStart, setNewEventStart] = useState(9);
  const [newEventDuration, setNewEventDuration] = useState(1);
  const [newEventColor, setNewEventColor] = useState('var(--blue)');

  // Add todo form
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoPriority, setNewTodoPriority] = useState<'p1' | 'p2' | 'p3'>('p3');

  // Now line — real current time
  const nowTop = (_now.getHours() + _now.getMinutes() / 60 - START_HOUR) * HOUR_HEIGHT;

  // Build calendar grid
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < month1DayOfWeek; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  const monthEvents = calEvents.filter((e) => {
    const em = (e as { month?: number }).month;
    const ey = (e as { year?: number }).year;
    if (typeof em === 'number' && typeof ey === 'number') {
      return em === _curMonth + 1 && ey === _curYear;
    }
    return true; // manually added events without month/year fall through
  });

  const eventDays = new Set(monthEvents.map((e) => e.date));
  const dayEvents = monthEvents.filter((e) => e.date === selectedDay);

  // Personal (Gmail) events render in the right column, everything else (Outlook/manual work) on the left
  const isPersonal = (ev: (typeof calEvents)[number]) =>
    ev.id.startsWith('gcal-') ||
    (ev as { source?: string }).source === 'personal' ||
    ev.category === 'Personal';

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    // Don't open if clicking on an event
    if (target.closest('[data-event]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = Math.floor(y / HOUR_HEIGHT) + START_HOUR;
    const clampedHour = Math.max(START_HOUR, Math.min(END_HOUR - 1, hour));
    setAddEventHour(clampedHour);
    setNewEventStart(clampedHour);
    setNewEventTitle('');
    setNewEventCategory('Work');
    setNewEventDuration(1);
    setNewEventColor('var(--blue)');
    setAddEventOpen(true);
  }

  function handleAddEvent() {
    if (!newEventTitle.trim()) return;
    addCalEvent({
      title: newEventTitle.trim(),
      start: newEventStart,
      duration: newEventDuration,
      color: newEventColor,
      category: newEventCategory,
      date: selectedDay,
      month: _curMonth + 1,
      year: _curYear,
    } as Parameters<typeof addCalEvent>[0]);
    setAddEventOpen(false);
    setNewEventTitle('');
  }

  function handleAddTodo() {
    if (!newTodoTitle.trim()) return;
    addTask({
      id: `t-${Date.now()}`,
      title: newTodoTitle.trim(),
      category: 'Work',
      priority: newTodoPriority,
      done: false,
      column: 'today',
    });
    setNewTodoTitle('');
    setNewTodoPriority('p3');
    setShowAddTodo(false);
  }

  const dayLabel = new Date(_curYear, _curMonth, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 280px',
        gap: 16,
        padding: 16,
        minHeight: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Left: Timeline */}
      <div style={{ ...cardBase, padding: 0, position: 'relative', overflow: 'hidden' }}>
        {/* Header */}
        <div
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid var(--line2)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: 'Newsreader, serif',
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            {dayLabel}
          </span>
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: 'var(--faint)',
            }}
          >
            {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={async () => {
              setSyncing(true);
              try {
                await Promise.all([
                  fetch(`${API_URL}/api/outlook/sync`),
                  fetch(`${API_URL}/api/google/sync`),
                ]);
              } finally { setSyncing(false); }
            }}
            disabled={syncing}
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              padding: '3px 10px',
              borderRadius: 6,
              border: '1px solid var(--line)',
              background: 'transparent',
              color: 'var(--ink2)',
              cursor: syncing ? 'default' : 'pointer',
              opacity: syncing ? 0.5 : 1,
            }}
          >
            {syncing ? 'Syncing…' : '↻ Sync'}
          </button>
        </div>

        {/* Column headers: Work | Personal */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line2)' }}>
          <div style={{ width: 52 }} />
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '6px 0',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9.5,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--blue)',
            }}
          >
            Work · Outlook
          </div>
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '6px 0',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9.5,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              borderLeft: '1px solid var(--line2)',
            }}
          >
            Personal · Gmail
          </div>
        </div>

        {/* Timeline body */}
        <div
          onClick={handleTimelineClick}
          style={{
            position: 'relative',
            height: TOTAL_HOURS * HOUR_HEIGHT,
            overflowY: 'auto',
            cursor: 'crosshair',
          }}
        >
          {/* Hour rows */}
          {Array.from({ length: TOTAL_HOURS }, (_, i) => {
            const hour = START_HOUR + i;
            const top = i * HOUR_HEIGHT;
            return (
              <React.Fragment key={hour}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: 52,
                    top,
                    height: HOUR_HEIGHT,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 12,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 9.5,
                    color: 'var(--faint)',
                    userSelect: 'none',
                  }}
                >
                  {formatHourLabel(hour)}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 52,
                    right: 0,
                    top: top + 22,
                    height: 1,
                    background: 'var(--line2)',
                  }}
                />
              </React.Fragment>
            );
          })}

          {/* Center divider between Work and Personal columns */}
          <div
            style={{
              position: 'absolute',
              left: 'calc(50% + 24px)',
              top: 0,
              bottom: 0,
              width: 1,
              background: 'var(--line2)',
            }}
          />

          {/* Events */}
          {dayEvents.map((ev) => {
            const top = (ev.start - START_HOUR) * HOUR_HEIGHT;
            const height = ev.duration * HOUR_HEIGHT - 4;
            const bg = eventBgMap[ev.color] || 'rgba(80,80,80,0.1)';
            const isSelected = selectedEventId === ev.id;
            const personal = isPersonal(ev);
            return (
              <React.Fragment key={ev.id}>
                <div
                  data-event="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEventId(isSelected ? null : ev.id);
                  }}
                  style={{
                    position: 'absolute',
                    top,
                    left: personal ? 'calc(50% + 28px)' : 60,
                    right: personal ? 12 : 'calc(50% - 20px)',
                    height,
                    padding: '4px 8px',
                    borderRadius: 3,
                    borderLeft: `3px solid ${ev.color}`,
                    backgroundColor: isSelected ? (eventBgMap[ev.color] || 'rgba(80,80,80,0.18)').replace('0.12', '0.22') : bg,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    outline: isSelected ? `2px solid ${ev.color}` : 'none',
                    outlineOffset: 1,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--ink)',
                      lineHeight: 1.3,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {ev.title}
                  </div>
                  <div
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 10,
                      color: 'var(--mut)',
                      lineHeight: 1.4,
                    }}
                  >
                    {formatEventTime(ev.start, ev.duration)}
                  </div>
                  {ev.duration >= 0.75 && (
                    <div
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 10,
                        color: 'var(--faint)',
                      }}
                    >
                      {ev.category}
                    </div>
                  )}
                </div>

                {/* Inline detail section */}
                {isSelected && (
                  <div
                    data-event="true"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: top + height + 4,
                      left: 60,
                      right: 12,
                      background: 'var(--card)',
                      border: `1px solid ${ev.color}`,
                      borderRadius: 6,
                      padding: '10px 12px',
                      zIndex: 20,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{ev.title}</span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 10,
                          background: 'var(--bg)',
                          border: `1px solid ${ev.color}`,
                          color: 'var(--ink2)',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      >
                        {ev.category}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mut)', marginBottom: 2 }}>
                      {formatEventTime(ev.start, ev.duration)} · {ev.duration < 1 ? `${ev.duration * 60}min` : `${ev.duration}h`}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => console.log('Edit event', ev.id)}
                        style={{
                          padding: '3px 10px',
                          fontSize: 11,
                          border: '1px solid var(--line)',
                          borderRadius: 3,
                          background: 'var(--bg)',
                          color: 'var(--ink2)',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { console.log('Delete event', ev.id); setSelectedEventId(null); }}
                        style={{
                          padding: '3px 10px',
                          fontSize: 11,
                          border: '1px solid var(--p1)',
                          borderRadius: 3,
                          background: 'oklch(0.96 0.04 27)',
                          color: 'var(--p1)',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {/* Now line */}
          <div
            style={{
              position: 'absolute',
              left: 52,
              right: 0,
              top: nowTop,
              height: 1,
              background: 'oklch(0.58 0.2 27)',
              zIndex: 10,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: -3,
                top: -3,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'oklch(0.58 0.2 27)',
              }}
            />
          </div>

          {/* Add event floating form */}
          {addEventOpen && (
            <div
              data-event="true"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: Math.max(0, (addEventHour - START_HOUR) * HOUR_HEIGHT),
                left: 60,
                right: 12,
                background: 'var(--card)',
                border: '1px solid var(--accent)',
                borderRadius: 8,
                padding: '14px',
                zIndex: 30,
                boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>Add Event</div>
              <input
                autoFocus
                type="text"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="Event title"
                style={{
                  width: '100%',
                  border: '1px solid var(--line)',
                  borderRadius: 3,
                  padding: '5px 8px',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  color: 'var(--ink)',
                  background: 'var(--bg)',
                  outline: 'none',
                  marginBottom: 8,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 3, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>Category</div>
                  <select
                    value={newEventCategory}
                    onChange={(e) => setNewEventCategory(e.target.value)}
                    style={{
                      width: '100%',
                      border: '1px solid var(--line)',
                      borderRadius: 3,
                      padding: '4px 6px',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      color: 'var(--ink)',
                      background: 'var(--bg)',
                      outline: 'none',
                    }}
                  >
                    {['Work', 'Personal', 'Focus', 'Health'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 3, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>Start (hour)</div>
                  <input
                    type="number"
                    min={7}
                    max={21}
                    value={newEventStart}
                    onChange={(e) => setNewEventStart(Number(e.target.value))}
                    style={{
                      width: '100%',
                      border: '1px solid var(--line)',
                      borderRadius: 3,
                      padding: '4px 6px',
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono, monospace',
                      color: 'var(--ink)',
                      background: 'var(--bg)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--faint)', marginBottom: 3, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>Duration</div>
                  <select
                    value={newEventDuration}
                    onChange={(e) => setNewEventDuration(Number(e.target.value))}
                    style={{
                      width: '100%',
                      border: '1px solid var(--line)',
                      borderRadius: 3,
                      padding: '4px 6px',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      color: 'var(--ink)',
                      background: 'var(--bg)',
                      outline: 'none',
                    }}
                  >
                    <option value={0.5}>30 min</option>
                    <option value={1}>1h</option>
                    <option value={1.5}>1.5h</option>
                    <option value={2}>2h</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', marginRight: 4 }}>Color</span>
                {COLOR_OPTIONS.map((c) => (
                  <div
                    key={c.value}
                    onClick={() => setNewEventColor(c.value)}
                    title={c.label}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: c.hex,
                      cursor: 'pointer',
                      border: newEventColor === c.value ? '2px solid var(--ink)' : '2px solid transparent',
                      boxSizing: 'border-box',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleAddEvent}
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Add
                </button>
                <button
                  onClick={() => setAddEventOpen(false)}
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    background: 'transparent',
                    color: 'var(--mut)',
                    border: '1px solid var(--line)',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Mini month calendar */}
        <div style={{ ...cardBase, padding: 14 }}>
          {/* Month header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{MONTH_NAME}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--mut)', cursor: 'pointer', userSelect: 'none' }}>‹</span>
              <span style={{ fontSize: 13, color: 'var(--mut)', cursor: 'pointer', userSelect: 'none' }}>›</span>
            </div>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div
                key={d}
                style={{
                  textAlign: 'center',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 9.5,
                  color: 'var(--faint)',
                  paddingBottom: 4,
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px 0' }}>
            {calendarDays.map((day, idx) => (
              <div
                key={idx}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1px 0' }}
              >
                {day !== null ? (
                  <>
                    <div
                      onClick={() => setSelectedDay(day)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12.5,
                        fontWeight: day === selectedDay ? 600 : 400,
                        background: day === selectedDay ? 'var(--ink)' : 'transparent',
                        color: day === selectedDay ? 'white' : 'var(--ink2)',
                        cursor: 'pointer',
                      }}
                    >
                      {day}
                    </div>
                    {eventDays.has(day) && day !== selectedDay && (
                      <div
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          marginTop: 1,
                        }}
                      />
                    )}
                  </>
                ) : (
                  <div style={{ width: 26, height: 26 }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Planner notes */}
        <div style={{ ...cardBase, padding: 14, flex: 1 }}>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              color: 'var(--faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 10,
            }}
          >
            Planner Notes
          </div>
          <textarea
            value={calNote}
            onChange={(e) => updateCalNote(e.target.value)}
            style={{
              width: '100%',
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--ink2)',
              whiteSpace: 'pre-wrap',
              outline: 'none',
              minHeight: 80,
              fontFamily: 'inherit',
              border: 'none',
              background: 'transparent',
              resize: 'none',
              boxSizing: 'border-box',
              padding: 0,
            }}
          />
          <div style={{ marginTop: 12, borderTop: '1px solid var(--line2)', paddingTop: 10 }}>
            <button
              onClick={() => setShowAddTodo((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 12,
                color: 'var(--accent)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
              }}
            >
              + Add to-do
            </button>
          </div>

          {/* Inline mini add-todo form */}
          {showAddTodo && (
            <div style={{ marginTop: 10 }}>
              <input
                autoFocus
                type="text"
                value={newTodoTitle}
                onChange={(e) => setNewTodoTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTodo(); if (e.key === 'Escape') setShowAddTodo(false); }}
                placeholder="Task title"
                style={{
                  width: '100%',
                  border: '1px solid var(--line)',
                  borderRadius: 3,
                  padding: '5px 8px',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  color: 'var(--ink)',
                  background: 'var(--bg)',
                  outline: 'none',
                  marginBottom: 7,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {(['p1', 'p2', 'p3'] as const).map((p) => {
                  const col = p === 'p1' ? 'var(--p1)' : p === 'p2' ? 'var(--p2)' : 'var(--p3)';
                  return (
                    <button
                      key={p}
                      onClick={() => setNewTodoPriority(p)}
                      style={{
                        padding: '2px 7px',
                        fontSize: 10,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontWeight: 600,
                        border: `1px solid ${newTodoPriority === p ? col : 'var(--line)'}`,
                        borderRadius: 3,
                        background: newTodoPriority === p ? 'var(--bg)' : 'transparent',
                        color: newTodoPriority === p ? col : 'var(--mut)',
                        cursor: 'pointer',
                      }}
                    >
                      {p.toUpperCase()}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button
                  onClick={handleAddTodo}
                  style={{
                    padding: '3px 10px',
                    fontSize: 11,
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Add
                </button>
                <button
                  onClick={() => setShowAddTodo(false)}
                  style={{
                    padding: '3px 10px',
                    fontSize: 11,
                    background: 'transparent',
                    color: 'var(--mut)',
                    border: '1px solid var(--line)',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
