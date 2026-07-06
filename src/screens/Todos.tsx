import React, { useState } from 'react';
import { useStore, type Task } from '../store/useStore';
import type { Screen } from '../App';

const cardBase: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

const priorityColor = (p: string) => {
  if (p === 'p1') return 'var(--p1)';
  if (p === 'p2') return 'var(--p2)';
  return 'var(--p3)';
};

const priorityBg = (p: string) => {
  if (p === 'p1') return 'oklch(0.96 0.04 27)';
  if (p === 'p2') return 'oklch(0.97 0.04 75)';
  return 'var(--bg)';
};

function dueBadge(dueDate?: string): { label: string; color: string; bg: string } | null {
  if (!dueDate) return null;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const due = new Date(`${dueDate}T12:00:00`);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: `overdue ${-days}d`, color: 'oklch(0.5 0.19 27)', bg: 'oklch(0.95 0.05 27)' };
  if (days === 0) return { label: 'due today', color: 'oklch(0.5 0.15 60)', bg: 'oklch(0.96 0.06 75)' };
  if (days <= 2) return { label: `due in ${days}d`, color: 'oklch(0.5 0.15 60)', bg: 'oklch(0.96 0.06 75)' };
  const label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { label: `due ${label}`, color: 'var(--mut)', bg: 'var(--bg)' };
}

const priorityLabel = (p: string) => {
  if (p === 'p1') return 'P1';
  if (p === 'p2') return 'P2';
  return 'P3';
};

function Checkbox({ done, onClick }: { done: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: '16px',
        height: '16px',
        border: done ? 'none' : '1px solid var(--line)',
        borderRadius: '2px',
        background: done ? 'var(--accent)' : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {done && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function TaskCard({
  task,
  onToggle,
  onMove,
  onEdit,
  onDelete,
  isHovered,
  onMouseEnter,
  onMouseLeave,
}: {
  task: Task;
  onToggle?: () => void;
  onMove?: (col: 'today' | 'upcoming' | 'done') => void;
  onEdit?: (updates: Partial<Pick<Task, 'title' | 'priority' | 'category' | 'dueDate'>>) => void;
  onDelete?: () => void;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const isDone = task.column === 'done';
  const isUpcoming = task.column === 'upcoming';
  const isToday = task.column === 'today';
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editPriority, setEditPriority] = useState(task.priority);
  const [editCategory, setEditCategory] = useState(task.category);
  const [editDueDate, setEditDueDate] = useState(task.dueDate || '');

  function saveEdit() {
    onEdit?.({ title: editTitle.trim() || task.title, priority: editPriority, category: editCategory, dueDate: editDueDate || undefined });
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ ...cardBase, borderLeft: `3px solid ${priorityColor(editPriority)}`, padding: '10px 12px', marginBottom: '8px' }}>
        <input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
          style={{ width: '100%', border: '1px solid var(--accent)', borderRadius: 3, padding: '5px 7px', fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg)', outline: 'none', boxSizing: 'border-box', marginBottom: 7 }}
        />
        <div style={{ display: 'flex', gap: 4, marginBottom: 7 }}>
          {(['p1', 'p2', 'p3'] as const).map((p) => (
            <button key={p} onClick={() => setEditPriority(p)} style={{ padding: '2px 7px', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, border: `1px solid ${editPriority === p ? priorityColor(p) : 'var(--line)'}`, borderRadius: 3, background: editPriority === p ? priorityBg(p) : 'transparent', color: editPriority === p ? priorityColor(p) : 'var(--mut)', cursor: 'pointer' }}>
              {p.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
          {['Work', 'Personal', 'Health'].map((cat) => (
            <button key={cat} onClick={() => setEditCategory(cat)} style={{ padding: '2px 7px', fontSize: 11, border: `1px solid ${editCategory === cat ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, background: editCategory === cat ? 'var(--accentbg)' : 'transparent', color: editCategory === cat ? 'var(--accent)' : 'var(--mut)', cursor: 'pointer', fontFamily: 'inherit' }}>
              {cat}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
          <span style={{ fontSize: 11, color: 'var(--mut)' }}>Due:</span>
          <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)}
            style={{ border: '1px solid var(--line)', borderRadius: 3, padding: '3px 6px', fontSize: 12, fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg)', outline: 'none' }} />
          {editDueDate && (
            <button onClick={() => setEditDueDate('')} style={{ padding: '2px 7px', fontSize: 10, border: '1px solid var(--line)', borderRadius: 3, background: 'transparent', color: 'var(--mut)', cursor: 'pointer', fontFamily: 'inherit' }}>clear</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={saveEdit} style={{ padding: '3px 10px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ padding: '3px 10px', fontSize: 12, background: 'transparent', color: 'var(--mut)', border: '1px solid var(--line)', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        ...cardBase,
        borderLeft: `3px solid ${priorityColor(task.priority)}`,
        padding: '10px 12px',
        marginBottom: '8px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
        <Checkbox done={isDone} onClick={!isUpcoming ? onToggle : undefined} />
        <span
          style={{
            fontSize: '13px',
            color: isDone ? 'var(--mut)' : 'var(--ink)',
            textDecoration: isDone ? 'line-through' : 'none',
            fontWeight: isDone ? 400 : 500,
            flex: 1,
            lineHeight: 1.4,
          }}
        >
          {task.title}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', paddingLeft: '24px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '3px', background: priorityBg(task.priority), color: priorityColor(task.priority), fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
          {priorityLabel(task.priority)}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--mut)', background: 'var(--bg)', border: '1px solid var(--line2)', borderRadius: '2px', padding: '1px 5px' }}>
          {task.category}
        </span>
        {(() => { const d = dueBadge(task.dueDate); return d && !isDone ? (
          <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '3px', background: d.bg, color: d.color, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
            {d.label}
          </span>
        ) : null; })()}
        {task.agentBadge && (
          <span style={{ fontSize: '10.5px', padding: '1px 6px', borderRadius: '10px', background: 'oklch(0.94 0.06 150)', color: 'oklch(0.38 0.1 150)', fontWeight: 500 }}>
            {task.agentBadge}
          </span>
        )}
      </div>

      {/* Hover actions */}
      {isHovered && (
        <div style={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {onEdit && (
            <button onClick={(e) => { e.stopPropagation(); setEditTitle(task.title); setEditPriority(task.priority); setEditCategory(task.category); setEditing(true); }} style={{ padding: '2px 6px', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, background: 'var(--card)', color: 'var(--ink2)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Edit
            </button>
          )}
          {onMove && isToday && (
            <button onClick={(e) => { e.stopPropagation(); onMove('upcoming'); }} style={{ padding: '2px 6px', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, background: 'var(--card)', color: 'var(--ink2)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              → Upcoming
            </button>
          )}
          {onMove && isUpcoming && (
            <>
              <button onClick={(e) => { e.stopPropagation(); onMove('today'); }} style={{ padding: '2px 6px', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, background: 'var(--card)', color: 'var(--ink2)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>← Today</button>
              <button onClick={(e) => { e.stopPropagation(); onMove('done'); }} style={{ padding: '2px 6px', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, background: 'var(--card)', color: 'var(--ink2)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>→ Done</button>
            </>
          )}
          {onMove && isDone && (
            <button onClick={(e) => { e.stopPropagation(); onMove('today'); }} style={{ padding: '2px 6px', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, background: 'var(--card)', color: 'var(--ink2)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>← Today</button>
          )}
          {onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ padding: '2px 6px', fontSize: 9, border: '1px solid var(--p1)', borderRadius: 3, background: 'oklch(0.97 0.02 27)', color: 'var(--p1)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  setScreen?: (s: Screen) => void;
}

export default function Todos({ setScreen: _setScreen }: Props) {
  const tasks = useStore((s) => s.tasks);
  const toggleTask = useStore((s) => s.toggleTask);
  const addTask = useStore((s) => s.addTask);
  const moveTask = useStore((s) => s.moveTask);
  const editTask = useStore((s) => s.editTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const [activeTab, setActiveTab] = useState<'All' | 'Work' | 'Personal' | 'Health'>('All');
  const [sortByPriority, setSortByPriority] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<'p1' | 'p2' | 'p3'>('p3');
  const [newCategory, setNewCategory] = useState('Personal');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const priorityOrder = { p1: 0, p2: 1, p3: 2 };

  const sortTasks = (arr: Task[]) => {
    if (!sortByPriority) return arr;
    return [...arr].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  };

  const filtered = activeTab === 'All' ? tasks : tasks.filter((t) => t.category === activeTab);
  const todayTasks = sortTasks(filtered.filter((t) => t.column === 'today'));
  const upcomingTasks = sortTasks(filtered.filter((t) => t.column === 'upcoming'));
  const doneTasks = sortTasks(filtered.filter((t) => t.column === 'done'));

  function handleAddTask() {
    if (!newTitle.trim()) return;
    addTask({
      id: Date.now().toString(),
      title: newTitle.trim(),
      category: newCategory,
      priority: newPriority,
      done: false,
      column: 'today',
      ...(newDueDate ? { dueDate: newDueDate } : {}),
    });
    setNewTitle('');
    setNewPriority('p3');
    setNewCategory('Personal');
    setNewDueDate('');
    setShowAddForm(false);
  }

  const columns = [
    { name: 'Today', tasks: todayTasks, isToday: true },
    { name: 'Upcoming', tasks: upcomingTasks, isToday: false },
    { name: 'Done', tasks: doneTasks, isToday: false },
  ];

  return (
    <div
      style={{
        padding: '20px',
        background: 'var(--bg)',
        minHeight: '100vh',
        fontFamily: "'Schibsted Grotesk', sans-serif",
        color: 'var(--ink)',
      }}
    >
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '16px' }}>
        {(['All', 'Work', 'Personal', 'Health'] as const).map((tab) => {
          const count = tab === 'All'
            ? tasks.filter((t) => t.column !== 'done').length
            : tasks.filter((t) => t.category === tab && t.column !== 'done').length;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '5px 14px',
                fontSize: '12.5px',
                fontFamily: "'Schibsted Grotesk', sans-serif",
                fontWeight: isActive ? 600 : 400,
                border: `1px solid ${isActive ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: '20px',
                background: isActive ? 'var(--accentbg)' : 'var(--card)',
                color: isActive ? 'var(--accent)' : 'var(--ink2)',
                cursor: 'pointer',
                transition: 'all .15s',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {tab}
              {count > 0 && (
                <span style={{
                  fontSize: '10px',
                  fontFamily: "'JetBrains Mono', monospace",
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: isActive ? 'var(--accent)' : 'var(--line2)',
                  color: isActive ? 'var(--ink-contrast)' : 'var(--mut)',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setSortByPriority((v) => !v)}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            border: `1px solid ${sortByPriority ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: '20px',
            background: sortByPriority ? 'var(--accentbg)' : 'var(--card)',
            color: sortByPriority ? 'var(--accent)' : 'var(--ink2)',
            cursor: 'pointer',
            fontFamily: "'Schibsted Grotesk', sans-serif",
            fontWeight: sortByPriority ? 600 : 400,
            transition: 'all .15s',
          }}
        >
          Sort by Priority
        </button>
      </div>

      {/* Kanban columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          alignItems: 'start',
        }}
      >
        {columns.map((col) => (
          <div key={col.name}>
            {/* Column header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{col.name}</span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '11px',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  background: 'var(--line2)',
                  color: 'var(--mut)',
                }}
              >
                {col.tasks.length}
              </span>
              {col.isToday && (
                <button
                  onClick={() => setShowAddForm((v) => !v)}
                  style={{
                    marginLeft: 'auto',
                    padding: '2px 8px',
                    fontSize: '11px',
                    border: '1px solid var(--line)',
                    borderRadius: '3px',
                    background: showAddForm ? 'var(--accentbg)' : 'var(--card)',
                    color: showAddForm ? 'var(--accent)' : 'var(--ink2)',
                    cursor: 'pointer',
                    fontFamily: "'Schibsted Grotesk', sans-serif",
                  }}
                >
                  + Add task
                </button>
              )}
            </div>

            {/* Inline add form (Today column only) */}
            {col.isToday && showAddForm && (
              <div
                style={{
                  ...cardBase,
                  padding: '12px',
                  marginBottom: '8px',
                  border: '1px solid var(--accent)',
                }}
              >
                <input
                  autoFocus
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') setShowAddForm(false); }}
                  placeholder="What needs to get done?"
                  style={{
                    width: '100%',
                    border: '1px solid var(--line)',
                    borderRadius: '3px',
                    padding: '6px 8px',
                    fontSize: '13px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    color: 'var(--ink)',
                    background: 'var(--bg)',
                    marginBottom: '8px',
                    boxSizing: 'border-box',
                  }}
                />
                {/* Priority selector */}
                <div style={{ display: 'flex', gap: '5px', marginBottom: '7px' }}>
                  {(['p1', 'p2', 'p3'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setNewPriority(p)}
                      style={{
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 600,
                        border: `1px solid ${newPriority === p ? priorityColor(p) : 'var(--line)'}`,
                        borderRadius: '3px',
                        background: newPriority === p ? priorityBg(p) : 'transparent',
                        color: newPriority === p ? priorityColor(p) : 'var(--mut)',
                        cursor: 'pointer',
                      }}
                    >
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
                {/* Category selector */}
                <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                  {['Work', 'Personal', 'Health'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setNewCategory(cat)}
                      style={{
                        padding: '2px 8px',
                        fontSize: '11px',
                        border: `1px solid ${newCategory === cat ? 'var(--accent)' : 'var(--line)'}`,
                        borderRadius: '10px',
                        background: newCategory === cat ? 'var(--accentbg)' : 'transparent',
                        color: newCategory === cat ? 'var(--accent)' : 'var(--mut)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {/* Due date (optional) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--mut)' }}>Due (optional):</span>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: '3px',
                      padding: '3px 6px',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      color: 'var(--ink)',
                      background: 'var(--bg)',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={handleAddTask}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      background: 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      background: 'transparent',
                      color: 'var(--mut)',
                      border: '1px solid var(--line)',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Task cards */}
            <div>
              {col.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={() => toggleTask(task.id)}
                  onMove={(col) => moveTask(task.id, col)}
                  onEdit={(updates) => editTask(task.id, updates)}
                  onDelete={() => deleteTask(task.id)}
                  isHovered={hoveredId === task.id}
                  onMouseEnter={() => setHoveredId(task.id)}
                  onMouseLeave={() => setHoveredId(null)}
                />
              ))}
              {col.tasks.length === 0 && !showAddForm && (
                <div
                  style={{
                    ...cardBase,
                    padding: '20px 12px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: 'var(--faint)',
                    border: '1px dashed var(--line)',
                    boxShadow: 'none',
                  }}
                >
                  No tasks
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
