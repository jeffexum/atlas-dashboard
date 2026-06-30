import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import type { Screen } from '../App';

const card: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

interface Props {
  setScreen?: (s: Screen) => void;
}

export default function Reading({ setScreen: _setScreen }: Props) {
  const books = useStore((s) => s.books);
  const highlights = useStore((s) => s.highlights);
  const updateBookProgress = useStore((s) => s.updateBookProgress);
  const addBook = useStore((s) => s.addBook);
  const reorderBook = useStore((s) => s.reorderBook);
  const startReading = useStore((s) => s.startReading);

  const readingBooks = books.filter((b) => b.status === 'reading');
  const queueBooks = books.filter((b) => b.status === 'queue');

  const [progressInputs, setProgressInputs] = useState<Record<string, string>>({});
  const [showAddBook, setShowAddBook] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');

  function handleSaveProgress(bookId: string) {
    const val = parseInt(progressInputs[bookId] ?? '', 10);
    if (!isNaN(val)) {
      updateBookProgress(bookId, val);
      setProgressInputs((prev) => ({ ...prev, [bookId]: '' }));
    }
  }

  function handleAddBook() {
    if (!newTitle.trim()) return;
    addBook(newTitle.trim(), newAuthor.trim());
    setNewTitle('');
    setNewAuthor('');
    setShowAddBook(false);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
      {/* Left column */}
      <div>
        {/* Currently Reading */}
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Currently Reading</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {readingBooks.map((book) => (
            <div key={book.id} style={{ ...card, padding: 14 }}>
              <div style={{ width: 60, height: 80, borderRadius: 3, background: book.gradient }} />
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>{book.title}</div>
              <div style={{ fontSize: 12, color: 'var(--mut)' }}>{book.author}</div>
              <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: 'var(--line2)' }}>
                <div style={{ height: '100%', borderRadius: 2, background: 'var(--accent)', width: `${book.pct}%` }} />
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--faint)', marginTop: 3 }}>
                {book.pct}%{book.chapter ? ` · ${book.chapter}` : ''}
              </div>
              {/* Update progress control */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={progressInputs[book.id] ?? ''}
                  onChange={(e) => setProgressInputs((prev) => ({ ...prev, [book.id]: e.target.value }))}
                  placeholder={String(book.pct)}
                  style={{
                    width: 52,
                    border: '1px solid var(--line)',
                    borderRadius: 3,
                    padding: '3px 6px',
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: 'var(--ink)',
                    background: 'var(--bg)',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--mut)' }}>%</span>
                <button
                  onClick={() => handleSaveProgress(book.id)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 11,
                    background: 'var(--accentbg)',
                    color: 'var(--accent)',
                    border: '1px solid var(--accent)',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ))}

          {/* Add book ghost card */}
          {!showAddBook ? (
            <div
              onClick={() => setShowAddBook(true)}
              style={{
                ...card,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 140,
                border: '1px dashed var(--line)',
                boxShadow: 'none',
                cursor: 'pointer',
                color: 'var(--faint)',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 22 }}>+</span>
              <span style={{ fontSize: 12 }}>Add book</span>
            </div>
          ) : (
            <div style={{ ...card, padding: 14, border: '1px solid var(--accent)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Add to queue</div>
              <input
                autoFocus
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Title"
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
                  marginBottom: 6,
                  boxSizing: 'border-box',
                }}
              />
              <input
                type="text"
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
                placeholder="Author"
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
                  marginBottom: 10,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleAddBook}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Add to queue
                </button>
                <button
                  onClick={() => setShowAddBook(false)}
                  style={{
                    padding: '4px 10px',
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

        {/* Up Next */}
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>Up Next</div>
        <div style={{ ...card }}>
          {queueBooks.map((item, i) => (
            <div
              key={item.id}
              style={{
                padding: '8px 12px',
                borderBottom: i < queueBooks.length - 1 ? '1px solid var(--line2)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'var(--bg)', border: '1px solid var(--line)',
                  fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                  textAlign: 'center', lineHeight: '20px', flexShrink: 0, color: 'var(--ink)',
                }}
              >
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: 'var(--ink)' }}>{item.title}</span>
                <span style={{ fontSize: 12, color: 'var(--mut)', marginLeft: 6 }}>{item.author}</span>
              </div>

              {/* Reorder + start reading buttons */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                <button
                  onClick={() => reorderBook(item.id, 'up')}
                  disabled={i === 0}
                  title="Move up"
                  style={{
                    padding: '2px 6px',
                    fontSize: 11,
                    border: '1px solid var(--line)',
                    borderRadius: 3,
                    background: 'var(--bg)',
                    color: i === 0 ? 'var(--faint)' : 'var(--ink2)',
                    cursor: i === 0 ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  ↑
                </button>
                <button
                  onClick={() => reorderBook(item.id, 'down')}
                  disabled={i === queueBooks.length - 1}
                  title="Move down"
                  style={{
                    padding: '2px 6px',
                    fontSize: 11,
                    border: '1px solid var(--line)',
                    borderRadius: 3,
                    background: 'var(--bg)',
                    color: i === queueBooks.length - 1 ? 'var(--faint)' : 'var(--ink2)',
                    cursor: i === queueBooks.length - 1 ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  ↓
                </button>
                <button
                  onClick={() => startReading(item.id)}
                  title="Start reading"
                  style={{
                    padding: '2px 8px',
                    fontSize: 11,
                    border: '1px solid var(--accent)',
                    borderRadius: 3,
                    background: 'var(--accentbg)',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ▶ Start
                </button>
              </div>
            </div>
          ))}
          {queueBooks.length === 0 && (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--faint)', textAlign: 'center' }}>Queue is empty</div>
          )}
        </div>
      </div>

      {/* Right column */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Saved Highlights</div>
        {highlights.map((h) => (
          <div
            key={h.id}
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-card)',
              background: 'var(--accentbg)',
              border: '1px solid oklch(0.88 0.06 162)',
              marginBottom: 8,
            }}
          >
            <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 14, lineHeight: 1.6, color: 'var(--ink2)' }}>
              "{h.quote}"
            </div>
            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'var(--faint)', marginTop: 6 }}>
              — {h.source}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
