import React, { useState } from 'react';
import { useStore, addShoppingItem, toggleShoppingItem, deleteShoppingItem, clearBoughtShopping } from '../store/useStore';
import type { ShoppingCategory } from '../store/useStore';

const cardBase: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

const CATEGORIES: { key: ShoppingCategory; label: string; icon: string; accent: string }[] = [
  { key: 'Groceries', label: 'Groceries', icon: '🛒', accent: 'var(--accent)' },
  { key: 'House', label: 'House', icon: '🏠', accent: 'var(--blue)' },
  { key: 'Misc', label: 'Misc', icon: '📦', accent: 'var(--violet)' },
];

export default function Shopping() {
  const shopping = useStore((s) => s.shopping);
  const userName = useStore((s) => s.userName);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<ShoppingCategory>('Groceries');
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!newName.trim() || adding) return;
    setAdding(true);
    try {
      await addShoppingItem(newName.trim(), newCategory);
      setNewName('');
    } finally { setAdding(false); }
  }

  const boughtCount = shopping.filter((i) => i.done).length;

  return (
    <div style={{ padding: 16, maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Add bar */}
      <div style={{ ...cardBase, padding: '12px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          autoFocus
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="Add an item… (Enter to add)"
          style={{
            flex: 1, minWidth: 220, border: '1px solid var(--line)', borderRadius: 8,
            padding: '8px 12px', fontSize: 13.5, fontFamily: 'inherit',
            color: 'var(--ink)', background: 'var(--bg)', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setNewCategory(c.key)}
              style={{
                padding: '6px 12px', fontSize: 12.5, borderRadius: 16,
                border: `1px solid ${newCategory === c.key ? c.accent : 'var(--line)'}`,
                background: newCategory === c.key ? 'var(--bg)' : 'transparent',
                color: newCategory === c.key ? 'var(--ink)' : 'var(--mut)',
                fontWeight: newCategory === c.key ? 600 : 400,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || adding}
          style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 600, background: 'var(--accent)',
            color: '#fff', border: 'none', borderRadius: 8,
            cursor: newName.trim() && !adding ? 'pointer' : 'default',
            opacity: newName.trim() && !adding ? 1 : 0.5, fontFamily: 'inherit',
          }}
        >
          Add
        </button>
      </div>

      {/* Category columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, alignItems: 'start' }}>
        {CATEGORIES.map((cat) => {
          const items = shopping.filter((i) => i.category === cat.key);
          const open = items.filter((i) => !i.done);
          const bought = items.filter((i) => i.done);
          return (
            <div key={cat.key} style={{ ...cardBase, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line2)', display: 'flex', alignItems: 'center', gap: 8, borderTop: `3px solid ${cat.accent}` }}>
                <span style={{ fontSize: 16 }}>{cat.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{cat.label}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--faint)' }}>
                  {open.length} to buy
                </span>
              </div>
              <div style={{ padding: '6px 8px' }}>
                {open.length === 0 && bought.length === 0 && (
                  <div style={{ padding: '14px 8px', fontSize: 12.5, color: 'var(--faint)', fontStyle: 'italic' }}>Nothing needed</div>
                )}
                {[...open, ...bought].map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px',
                      borderRadius: 6, opacity: item.done ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div
                      onClick={() => toggleShoppingItem(item.id)}
                      style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: 'pointer',
                        border: `1.5px solid ${item.done ? cat.accent : 'var(--line)'}`,
                        background: item.done ? cat.accent : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 12, fontWeight: 700,
                      }}
                    >
                      {item.done ? '✓' : ''}
                    </div>
                    <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink)', textDecoration: item.done ? 'line-through' : 'none' }}>
                      {item.name}
                    </span>
                    {item.addedBy && item.addedBy !== userName && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--line2)', color: 'var(--mut)' }}>
                        {item.addedBy}
                      </span>
                    )}
                    <span
                      onClick={() => deleteShoppingItem(item.id)}
                      title="Remove"
                      style={{ fontSize: 13, color: 'var(--faint)', cursor: 'pointer', padding: '0 4px' }}
                    >
                      ✕
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Clear bought */}
      {boughtCount > 0 && (
        <div>
          <button
            onClick={() => clearBoughtShopping()}
            style={{
              padding: '6px 14px', fontSize: 12.5, background: 'transparent',
              color: 'var(--mut)', border: '1px solid var(--line)', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Clear {boughtCount} bought item{boughtCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
