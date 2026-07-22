import React, { useState, useEffect } from 'react';
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
  // Edit-in-place + drag-to-move state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editDuration, setEditDuration] = useState(1);
  const [evBusy, setEvBusy] = useState(false);
  // Optimistic position overrides while the server round-trips
  const [evOverrides, setEvOverrides] = useState<Record<string, { start: number }>>({});
  const dragRef = React.useRef<{ id: string; startY: number; origStart: number; moved: boolean } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; start: number } | null>(null);

  async function saveEvent(id: string, patch: { title?: string; start?: number; duration?: number }) {
    setEvBusy(true);
    if (patch.start !== undefined) setEvOverrides((o) => ({ ...o, [id]: { start: patch.start! } }));
    try {
      const res = await fetch(`${API_URL}/api/calendar/events/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    } catch (err) {
      alert(`Couldn't update event: ${(err as Error).message}`);
      setEvOverrides((o) => { const { [id]: _drop, ...rest } = o; return rest; });
    } finally {
      setEvBusy(false);
      setEditingId(null);
    }
  }

  async function deleteEvent(id: string) {
    if (!confirm('Delete this event from your calendar?')) return;
    setEvBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/calendar/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setSelectedEventId(null);
    } catch (err) {
      alert(`Couldn't delete event: ${(err as Error).message}`);
    } finally {
      setEvBusy(false);
    }
  }

  // Drag-to-move: vertical drag snaps to 15-minute increments
  React.useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.abs(dy) < 5) return;
      d.moved = true;
      const raw = d.origStart + dy / HOUR_HEIGHT;
      const snapped = Math.max(START_HOUR, Math.min(END_HOUR - 0.25, Math.round(raw * 4) / 4));
      setDragPreview({ id: d.id, start: snapped });
    }
    function onUp() {
      const d = dragRef.current;
      dragRef.current = null;
      setDragPreview((p) => {
        if (d && d.moved && p && p.id === d.id && p.start !== d.origStart) {
          saveEvent(d.id, { start: p.start });
        }
        return null;
      });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);
  const [syncing, setSyncing] = useState(false);

  // Month navigation for the mini calendar
  const [viewYear, setViewYear] = useState(_curYear);
  const [viewMonth, setViewMonth] = useState(_curMonth); // 0-indexed
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const month1DayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const MONTH_NAME = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const isCurrentMonth = viewYear === _curYear && viewMonth === _curMonth;

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    // Land on today when returning to the current month, otherwise on the 1st
    const backToNow = d.getFullYear() === _curYear && d.getMonth() === _curMonth;
    setSelectedDay(backToNow ? _now.getDate() : 1);
    setSelectedEventId(null);
  }
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

  // Now line — ticks every 30s so the bar stays accurate without a refresh.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const nowHourFloat = now.getHours() + now.getMinutes() / 60;
  const nowTop = (nowHourFloat - START_HOUR) * HOUR_HEIGHT;
  // Only show the bar when today is the selected day and the time is in-range.
  const viewingToday = viewYear === _curYear && viewMonth === _curMonth && selectedDay === now.getDate();
  const nowInRange = nowHourFloat >= START_HOUR && nowHourFloat <= END_HOUR;
  const showNowLine = viewingToday && nowInRange;

  // Build calendar grid
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < month1DayOfWeek; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  const monthEvents = calEvents.filter((e) => {
    const em = (e as { month?: number }).month;
    const ey = (e as { year?: number }).year;
    if (typeof em === 'number' && typeof ey === 'number') {
      return em === viewMonth + 1 && ey === viewYear;
    }
    return isCurrentMonth; // legacy events without month/year belong to the current month
  });

  const eventDays = new Set(monthEvents.map((e) => e.date));
  const allSelectedDay = monthEvents.filter((e) => e.date === selectedDay);
  const isAllDayEv = (e: { allDay?: boolean; title: string }) => !!e.allDay || e.title.startsWith('📅');
  const allDayEvents = allSelectedDay.filter(isAllDayEv);
  const dayEvents = allSelectedDay.filter((e) => !isAllDayEv(e));

  // Personal (Gmail) events render in the right column, everything else (Outlook/manual work) on the left
  const isPersonal = (ev: (typeof calEvents)[number]) =>
    ev.id.startsWith('gcal-') ||
    (ev as { source?: string }).source === 'personal' ||
    ev.category === 'Personal';

  // Overlapping events within a column share the width in side-by-side lanes
  function layoutLanes(evts: typeof dayEvents): Map<string, { lane: number; lanes: number }> {
    const sorted = [...evts].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const result = new Map<string, { lane: number; lanes: number }>();
    let cluster: { id: string; lane: number }[] = [];
    let laneEnds: number[] = [];
    let clusterEnd = 0;
    const flush = () => {
      cluster.forEach((c) => result.set(c.id, { lane: c.lane, lanes: laneEnds.length }));
      cluster = [];
      laneEnds = [];
      clusterEnd = 0;
    };
    for (const ev of sorted) {
      if (cluster.length && ev.start >= clusterEnd) flush();
      let lane = laneEnds.findIndex((end) => end <= ev.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = ev.start + ev.duration;
      cluster.push({ id: ev.id, lane });
      clusterEnd = Math.max(clusterEnd, ev.start + ev.duration);
    }
    flush();
    return result;
  }
  const laneMap = new Map([
    ...layoutLanes(dayEvents.filter((e) => !isPersonal(e))),
    ...layoutLanes(dayEvents.filter((e) => isPersonal(e))),
  ]);

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
      month: viewMonth + 1,
      year: viewYear,
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

  const dayLabel = new Date(viewYear, viewMonth, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

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
            {allSelectedDay.length} event{allSelectedDay.length !== 1 ? 's' : ''}
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

        {/* All-day band */}
        {allDayEvents.length > 0 && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--line2)', background: 'var(--bg)' }}>
            <div style={{ width: 52, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: 8.5, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              all day
            </div>
            {[false, true].map((personal) => (
              <div key={String(personal)} style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, padding: '5px 8px', borderLeft: personal ? '1px solid var(--line2)' : 'none', minHeight: 26, boxSizing: 'border-box' }}>
                {allDayEvents.filter((e) => isPersonal(e) === personal).map((e) => (
                  <span key={e.id} title={e.title.replace('📅 ', '')}
                    style={{ fontSize: 11, padding: '2px 9px', borderRadius: 10, background: 'var(--accentbg)', color: 'var(--ink2)', border: '1px solid var(--line)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                    {e.title.replace('📅 ', '')}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}

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
                {/* Label centered ON the hour line so events (positioned at the
                    hour boundary) align with the axis */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: 52,
                    top: Math.max(0, top - 7),
                    height: 14,
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
                    top,
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
            const liveStart = dragPreview?.id === ev.id ? dragPreview.start
              : evOverrides[ev.id]?.start ?? ev.start;
            const top = (liveStart - START_HOUR) * HOUR_HEIGHT;
            const height = ev.duration * HOUR_HEIGHT - 4;
            const bg = eventBgMap[ev.color] || 'rgba(80,80,80,0.1)';
            const isSelected = selectedEventId === ev.id;
            const personal = isPersonal(ev);
            const { lane, lanes } = laneMap.get(ev.id) || { lane: 0, lanes: 1 };
            // Both columns are (50% - 40px) wide; work starts at 60px, personal at 50%+28px
            const colLeft = personal ? '50% + 28px' : '60px';
            return (
              <React.Fragment key={ev.id}>
                <div
                  data-event="true"
                  onMouseDown={(e) => {
                    if (ev.allDay) return;
                    dragRef.current = { id: ev.id, startY: e.clientY, origStart: liveStart, moved: false };
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dragPreview) return; // finishing a drag, not a click
                    setSelectedEventId(isSelected ? null : ev.id);
                  }}
                  style={{
                    position: 'absolute',
                    top,
                    left: `calc(${colLeft} + (50% - 40px) * ${lane / lanes})`,
                    width: `calc((50% - 40px) * ${1 / lanes} - ${lanes > 1 ? 3 : 0}px)`,
                    height,
                    padding: '4px 8px',
                    borderRadius: 3,
                    borderLeft: `3px solid ${ev.color}`,
                    backgroundColor: isSelected ? (eventBgMap[ev.color] || 'rgba(80,80,80,0.18)').replace('0.12', '0.22') : bg,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    cursor: dragPreview?.id === ev.id ? 'grabbing' : 'pointer',
                    opacity: dragPreview?.id === ev.id ? 0.75 : 1,
                    zIndex: dragPreview?.id === ev.id ? 30 : undefined,
                    userSelect: 'none',
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
                    {formatEventTime(liveStart, ev.duration)}
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
                      left: `calc(${colLeft})`,
                      width: 'calc(50% - 40px)',
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
                    {editingId === ev.id && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                          style={{ padding: '5px 8px', fontSize: 12.5, border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg)' }} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} step={900}
                            style={{ padding: '4px 6px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg)' }} />
                          <select value={editDuration} onChange={(e) => setEditDuration(Number(e.target.value))}
                            style={{ padding: '4px 6px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg)' }}>
                            {[0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].map((d) => (
                              <option key={d} value={d}>{d < 1 ? `${d * 60} min` : `${d} hr`}</option>
                            ))}
                          </select>
                          <button disabled={evBusy}
                            onClick={() => {
                              const [h, m] = editStart.split(':').map(Number);
                              saveEvent(ev.id, { title: editTitle, start: h + (m || 0) / 60, duration: editDuration });
                            }}
                            style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', opacity: evBusy ? 0.6 : 1 }}>
                            {evBusy ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => {
                          if (editingId === ev.id) { setEditingId(null); return; }
                          setEditingId(ev.id);
                          setEditTitle(ev.title);
                          const h = Math.floor(ev.start); const m = Math.round((ev.start - h) * 60);
                          setEditStart(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                          setEditDuration(ev.duration);
                        }}
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
                        {editingId === ev.id ? 'Cancel' : 'Edit'}
                      </button>
                      <button
                        onClick={() => deleteEvent(ev.id)}
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

          {/* Now line — only on today, ticks live */}
          {showNowLine && <div
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
          </div>}

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
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {!isCurrentMonth && (
                <span
                  onClick={() => { setViewYear(_curYear); setViewMonth(_curMonth); setSelectedDay(_now.getDate()); }}
                  style={{ fontSize: 10.5, color: 'var(--accent)', cursor: 'pointer', userSelect: 'none', marginRight: 4, fontFamily: 'JetBrains Mono, monospace' }}
                >
                  today
                </span>
              )}
              <span onClick={() => shiftMonth(-1)} style={{ fontSize: 15, color: 'var(--mut)', cursor: 'pointer', userSelect: 'none', padding: '0 6px' }}>‹</span>
              <span onClick={() => shiftMonth(1)} style={{ fontSize: 15, color: 'var(--mut)', cursor: 'pointer', userSelect: 'none', padding: '0 6px' }}>›</span>
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
                        color: day === selectedDay ? 'var(--ink-contrast)' : 'var(--ink2)',
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
