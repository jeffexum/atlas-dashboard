import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import type { Screen } from '../App';

const card: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

const scoutNotes: Record<string, string | null> = {
  g1: 'behind pace',
  g2: 'on track',
  g3: null,
  g4: null,
};

const GOAL_COLORS = [
  { label: 'Red', value: '#ef4444' },
  { label: 'Blue', value: '#60a5fa' },
  { label: 'Green', value: '#4ade80' },
  { label: 'Violet', value: '#a78bfa' },
];

interface Props {
  setScreen?: (s: Screen) => void;
}

export default function Goals({ setScreen: _setScreen }: Props) {
  const goals = useStore((s) => s.goals);
  const assistantName = useStore((s) => s.assistantName);
  const updateGoalProgress = useStore((s) => s.updateGoalProgress);
  const addGoal = useStore((s) => s.addGoal);
  const editGoal = useStore((s) => s.editGoal);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formTarget, setFormTarget] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formColor, setFormColor] = useState('#60a5fa');

  function openCreate() {
    setEditingId(null);
    setFormName('');
    setFormTarget('');
    setFormDeadline('');
    setFormColor('#60a5fa');
    setModalOpen(true);
  }

  function openEdit(id: string) {
    const goal = goals.find((g) => g.id === id);
    if (!goal) return;
    setEditingId(id);
    setFormName(goal.name);
    setFormTarget(goal.target);
    setFormDeadline(goal.deadline);
    // Try to match color value
    const found = GOAL_COLORS.find((c) => c.value === goal.color);
    setFormColor(found ? found.value : '#60a5fa');
    setModalOpen(true);
  }

  function handleSubmit() {
    if (!formName.trim()) return;
    if (editingId) {
      editGoal(editingId, {
        name: formName.trim(),
        target: formTarget.trim(),
        deadline: formDeadline.trim(),
        color: formColor,
        deadlineShort: formDeadline.trim().slice(0, 3) + "'26",
      });
    } else {
      addGoal(formName.trim(), formTarget.trim(), formDeadline.trim(), formColor);
    }
    setModalOpen(false);
  }

  return (
    <>
      {/* Modal overlay */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card)',
              borderRadius: 16,
              padding: 32,
              width: 420,
              boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', marginBottom: 20 }}>
              {editingId ? 'Edit Goal' : 'New Goal'}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 5, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Goal Name *</div>
              <input
                autoFocus
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Run 500 miles"
                style={{
                  width: '100%',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  color: 'var(--ink)',
                  background: 'var(--bg)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 5, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Target</div>
              <input
                type="text"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                placeholder="e.g. 500 miles"
                style={{
                  width: '100%',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  color: 'var(--ink)',
                  background: 'var(--bg)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 5, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Deadline</div>
              <input
                type="text"
                value={formDeadline}
                onChange={(e) => setFormDeadline(e.target.value)}
                placeholder="e.g. Dec 31, 2026"
                style={{
                  width: '100%',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  color: 'var(--ink)',
                  background: 'var(--bg)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 8, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Color</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {GOAL_COLORS.map((c) => (
                  <div
                    key={c.value}
                    onClick={() => setFormColor(c.value)}
                    title={c.label}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: c.value,
                      cursor: 'pointer',
                      border: formColor === c.value ? '3px solid var(--ink)' : '3px solid transparent',
                      boxSizing: 'border-box',
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSubmit}
                style={{
                  padding: '8px 18px',
                  fontSize: 13,
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                }}
              >
                {editingId ? 'Save changes' : 'Create goal'}
              </button>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  padding: '8px 18px',
                  fontSize: 13,
                  background: 'transparent',
                  color: 'var(--mut)',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: 16 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 14 }}>
          <button
            onClick={openCreate}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
            }}
          >
            + New goal
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {goals.map((goal) => (
            <div key={goal.id} style={{ ...card, padding: 20 }}>
              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 600, flex: 1, color: 'var(--ink)' }}>
                  {goal.name}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: goal.color,
                    background: 'var(--bg)',
                    border: `1px solid var(--line)`,
                    borderRadius: 'var(--radius-chip)',
                    padding: '2px 7px',
                  }}
                >
                  {goal.deadlineShort}
                </div>
                <button
                  onClick={() => openEdit(goal.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: 11,
                    color: 'var(--mut)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Edit
                </button>
              </div>

              {/* Big percentage */}
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 38,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  marginTop: 10,
                  lineHeight: 1,
                }}
              >
                {goal.pct}%
              </div>

              {/* Current / target */}
              <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 4 }}>
                {goal.current} of {goal.target}
              </div>

              {/* Progress bar */}
              <div
                style={{
                  width: '100%',
                  height: 8,
                  borderRadius: 4,
                  background: 'var(--line2)',
                  marginTop: 12,
                }}
              >
                <div
                  style={{
                    height: '100%',
                    borderRadius: 4,
                    background: goal.color,
                    width: `${goal.pct}%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              {/* Nudge buttons */}
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button
                  onClick={() => updateGoalProgress(goal.id, goal.pct + 5)}
                  style={{
                    padding: '3px 10px',
                    fontSize: 11.5,
                    fontFamily: "'JetBrains Mono', monospace",
                    border: '1px solid var(--line)',
                    borderRadius: 3,
                    background: 'var(--accentbg)',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                  }}
                >
                  +5%
                </button>
                <button
                  onClick={() => updateGoalProgress(goal.id, goal.pct - 5)}
                  style={{
                    padding: '3px 10px',
                    fontSize: 11.5,
                    fontFamily: "'JetBrains Mono', monospace",
                    border: '1px solid var(--line)',
                    borderRadius: 3,
                    background: 'transparent',
                    color: 'var(--mut)',
                    cursor: 'pointer',
                  }}
                >
                  -5%
                </button>
              </div>

              {/* Deadline */}
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10.5,
                  color: 'var(--faint)',
                  marginTop: 8,
                }}
              >
                Target: {goal.deadline}
              </div>

              {/* Linked tasks */}
              <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 4 }}>
                {goal.tasks} linked task{goal.tasks !== 1 ? 's' : ''}
              </div>

              {/* Scout note */}
              {scoutNotes[goal.id] !== null && scoutNotes[goal.id] !== undefined && (
                <div
                  style={{
                    display: 'inline-block',
                    marginTop: 10,
                    background: 'var(--accentbg)',
                    border: '1px solid oklch(0.88 0.06 162)',
                    borderRadius: 20,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: scoutNotes[goal.id] === 'on track' ? 'var(--accent)' : 'var(--p1)',
                  }}
                >
                  {assistantName}: {scoutNotes[goal.id]}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
