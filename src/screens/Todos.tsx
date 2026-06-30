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
  isHovered,
  onMouseEnter,
  onMouseLeave,
}: {
  task: Task;
  onToggle?: () => void;
  onMove?: (col: 'today' | 'upcoming' | 'done') => void;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const isDone = task.column === 'done';
  const isUpcoming = task.column === 'upcoming';
  const isToday = task.column === 'today';

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
        <span
          style={{
            fontSize: '10.5px',
            padding: '2px 6px',
            borderRadius: '3px',
            background: priorityBg(task.priority),
            color: priorityColor(task.priority),
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {priorityLabel(task.priority)}
        </span>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--mut)',
            background: 'var(--bg)',
            border: '1px solid var(--line2)',
            borderRadius: '2px',
            padding: '1px 5px',
          }}
        >
          {task.category}
        </span>
        {task.agentBadge && (
          <span
            style={{
              fontSize: '10.5px',
              padding: '1px 6px',
              borderRadius: '10px',
              background: 'oklch(0.94 0.06 150)',
              color: 'oklch(0.38 0.1 150)',
              fontWeight: 500,
            }}
          >
            {task.agentBadge}
          </span>
        )}
      </div>

      {/* Move buttons shown on hover */}
      {isHovered && onMove && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            right: 8,
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          {isToday && (
            <button
              onClick={(e) => { e.stopPropagation(); onMove('upcoming'); }}
              style={{
                padding: '2px 6px',
                fontSize: 9,
                border: '1px solid var(--line)',
                borderRadius: 3,
                background: 'var(--card)',
                color: 'var(--ink2)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              → Upcoming
            </button>
          )}
          {isUpcoming && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onMove('today'); }}
                style={{
                  padding: '2px 6px',
                  fontSize: 9,
                  border: '1px solid var(--line)',
                  borderRadius: 3,
                  background: 'var(--card)',
                  color: 'var(--ink2)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                ← Today
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onMove('done'); }}
                style={{
                  padding: '2px 6px',
                  fontSize: 9,
                  border: '1px solid var(--line)',
                  borderRadius: 3,
                  background: 'var(--card)',
                  color: 'var(--ink2)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                → Done
              </button>
            </>
          )}
          {isDone && (
            <button
              onClick={(e) => { e.stopPropagation(); onMove('today'); }}
              style={{
                padding: '2px 6px',
                fontSize: 9,
                border: '1px solid var(--line)',
                borderRadius: 3,
                background: 'var(--card)',
                color: 'var(--ink2)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              ← Today
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
  const [sortByPriority, setSortByPriority] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'p1' | 'p2' | 'p3'>('p3');
  const [newCategory, setNewCategory] = useState('Personal');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const priorityOrder = { p1: 0, p2: 1, p3: 2 };

  const sortTasks = (arr: Task[]) => {
    if (!sortByPriority) return arr;
    return [...arr].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  };

  const todayTasks = sortTasks(tasks.filter((t) => t.column === 'today'));
  const upcomingTasks = sortTasks(tasks.filter((t) => t.column === 'upcoming'));
  const doneTasks = sortTasks(tasks.filter((t) => t.column === 'done'));

  function handleAddTask() {
    if (!newTitle.trim()) return;
    addTask({
      id: Date.now().toString(),
      title: newTitle.trim(),
      category: newCategory,
      priority: newPriority,
      done: false,
      column: 'today',
    });
    setNewTitle('');
    setNewPriority('p3');
    setNewCategory('Personal');
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
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '13px', color: 'var(--mut)', fontWeight: 500 }}>Priority:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--p1)', display: 'inline-block' }} />
          <span style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>P1 Urgent</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--p2)', display: 'inline-block' }} />
          <span style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>P2 Important</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--p3)', display: 'inline-block' }} />
          <span style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>P3 Normal</span>
        </div>
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
