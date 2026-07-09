import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { Note, Idea } from '../store/useStore';
import type { Screen } from '../App';

const card: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 4,
  padding: '6px 9px',
  fontSize: 13,
  fontFamily: 'inherit',
  color: 'var(--ink)',
  background: 'var(--bg)',
  outline: 'none',
  boxSizing: 'border-box',
};

const btnPrimary: React.CSSProperties = {
  padding: '4px 12px', fontSize: 12, fontWeight: 600, background: 'var(--accent)', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
};
const btnGhost: React.CSSProperties = {
  padding: '4px 10px', fontSize: 12, background: 'transparent', color: 'var(--mut)',
  border: '1px solid var(--line)', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
};

type Tab = 'Notes' | 'Ideas' | 'Journal';

// ── Voice dictation (Web Speech API) ─────────────────────────────────────────
// Appends recognized speech to the target value. Chrome/Edge/Safari support
// webkitSpeechRecognition; the button hides itself where unsupported.
type SpeechRec = {
  new (): {
    lang: string; continuous: boolean; interimResults: boolean;
    onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } }) => void) | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
    start: () => void; stop: () => void;
  };
};
const SpeechRecognitionImpl: SpeechRec | undefined =
  (window as unknown as { SpeechRecognition?: SpeechRec; webkitSpeechRecognition?: SpeechRec }).SpeechRecognition
  || (window as unknown as { webkitSpeechRecognition?: SpeechRec }).webkitSpeechRecognition;

function MicButton({ onText }: { onText: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<InstanceType<SpeechRec> | null>(null);

  useEffect(() => () => { recRef.current?.stop(); }, []);

  if (!SpeechRecognitionImpl) return null;

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SpeechRecognitionImpl!();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal && r[0]?.transcript) onText(r[0].transcript.trim() + ' ');
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <button
      onClick={toggle}
      title={listening ? 'Stop dictation' : 'Dictate (voice to text)'}
      style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        border: listening ? '1px solid var(--p1)' : '1px solid var(--line)',
        background: listening ? 'oklch(0.6 0.18 27 / 0.15)' : 'var(--card)',
        cursor: 'pointer', fontSize: 14,
        animation: listening ? 'pulse 1.2s ease-in-out infinite' : 'none',
      }}
    >
      {listening ? '🔴' : '🎤'}
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }`}</style>
    </button>
  );
}

// ── Shared: search + tag filter bar ──────────────────────────────────────────
function FilterBar({ search, setSearch, tags, activeTag, setActiveTag }: {
  search: string; setSearch: (s: string) => void;
  tags: string[]; activeTag: string | null; setActiveTag: (t: string | null) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search…"
        style={{ ...inputStyle, width: 220 }}
      />
      {tags.map((tag) => (
        <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
          style={{
            padding: '3px 10px', fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            border: `1px solid ${activeTag === tag ? 'var(--accent)' : 'var(--line2)'}`,
            borderRadius: 10,
            background: activeTag === tag ? 'var(--accentbg)' : 'transparent',
            color: activeTag === tag ? 'var(--accent)' : 'var(--faint)', cursor: 'pointer',
          }}>
          #{tag}
        </button>
      ))}
    </div>
  );
}

function TagsInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)}
      placeholder="tags, comma separated" style={{ ...inputStyle, fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace" }} />
  );
}
const parseTags = (s: string) => s.split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 8);

function matches(search: string, activeTag: string | null, title: string, body: string, tags: string[]): boolean {
  if (activeTag && !tags.includes(activeTag)) return false;
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return `${title} ${body} ${tags.join(' ')}`.toLowerCase().includes(q);
}

// ── Notes tab ─────────────────────────────────────────────────────────────────
function NotesTab() {
  const notes = useStore((s) => s.notes);
  const addNote = useStore((s) => s.addNote);
  const updateNote = useStore((s) => s.updateNote);
  const deleteNote = useStore((s) => s.deleteNote);

  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eBody, setEBody] = useState('');
  const [eTags, setETags] = useState('');

  const allTags = [...new Set(notes.flatMap((n) => n.tags))].sort();
  const visible = notes
    .filter((n) => matches(search, activeTag, n.title, n.body, n.tags))
    .sort((a, b) => Number(b.pinned || false) - Number(a.pinned || false) || b.updatedAt - a.updatedAt);

  function submit() {
    if (!title.trim() && !body.trim()) return;
    addNote(title.trim() || 'Untitled', body.trim(), parseTags(tagsStr));
    setTitle(''); setBody(''); setTagsStr(''); setShowForm(false);
  }

  function startEdit(n: Note) {
    setEditingId(n.id); setETitle(n.title); setEBody(n.body); setETags(n.tags.join(', '));
  }
  function saveEdit() {
    if (!editingId) return;
    updateNote(editingId, { title: eTitle.trim() || 'Untitled', body: eBody, tags: parseTags(eTags) });
    setEditingId(null);
  }

  return (
    <div>
      <FilterBar search={search} setSearch={setSearch} tags={allTags} activeTag={activeTag} setActiveTag={setActiveTag} />

      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={{ ...btnGhost, marginBottom: 14 }}>+ New note</button>
      ) : (
        <div style={{ ...card, padding: 14, border: '1px solid var(--accent)', marginBottom: 14, maxWidth: 640 }}>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note title"
            style={{ ...inputStyle, width: '100%', marginBottom: 8, fontWeight: 600 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Write or dictate…"
              style={{ ...inputStyle, flex: 1, resize: 'vertical', lineHeight: 1.6 }} />
            <MicButton onText={(t) => setBody((b) => (b ? b + ' ' : '') + t)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <TagsInput value={tagsStr} onChange={setTagsStr} />
            <button onClick={submit} style={btnPrimary}>Save note</button>
            <button onClick={() => setShowForm(false)} style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ columnCount: 3, columnGap: 12 }}>
        {visible.map((n) => (
          <div key={n.id} style={{ ...card, padding: '12px 14px', breakInside: 'avoid', marginBottom: 12, borderTop: n.pinned ? '3px solid var(--accent)' : undefined }}>
            {editingId === n.id ? (
              <>
                <input value={eTitle} onChange={(e) => setETitle(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: 6, fontWeight: 600 }} />
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
                  <textarea value={eBody} onChange={(e) => setEBody(e.target.value)} rows={5}
                    style={{ ...inputStyle, flex: 1, resize: 'vertical', lineHeight: 1.6, fontSize: 12.5 }} />
                  <MicButton onText={(t) => setEBody((b) => (b ? b + ' ' : '') + t)} />
                </div>
                <TagsInput value={eTags} onChange={setETags} />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={saveEdit} style={btnPrimary}>Save</button>
                  <button onClick={() => setEditingId(null)} style={btnGhost}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{n.title}</div>
                  <button title={n.pinned ? 'Unpin' : 'Pin to top'} onClick={() => updateNote(n.id, { pinned: !n.pinned })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, opacity: n.pinned ? 1 : 0.35, padding: 0 }}>📌</button>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55, whiteSpace: 'pre-wrap', margin: '6px 0 8px' }}>{n.body}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {n.tags.map((t) => (
                    <span key={t} style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'var(--faint)', background: 'var(--bg)', border: '1px solid var(--line2)', borderRadius: 2, padding: '1px 6px' }}>#{t}</span>
                  ))}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--faint)' }}>
                    {new Date(n.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <button onClick={() => startEdit(n)} style={{ ...btnGhost, padding: '1px 7px', fontSize: 10.5 }}>Edit</button>
                  <button onClick={() => { if (confirm(`Delete note "${n.title}"?`)) deleteNote(n.id); }}
                    style={{ ...btnGhost, padding: '1px 7px', fontSize: 10.5, color: 'var(--p1)', borderColor: 'var(--p1)' }}>✕</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {visible.length === 0 && (
        <div style={{ ...card, padding: 20, maxWidth: 640, fontSize: 12.5, color: 'var(--mut)', fontStyle: 'italic' }}>
          {notes.length ? 'No notes match your search.' : 'No notes yet — capture anything here (typed or dictated 🎤), or tell Adler "note this down" from Telegram or the Whiteboard.'}
        </div>
      )}
    </div>
  );
}

// ── Ideas tab ─────────────────────────────────────────────────────────────────
function IdeasTab() {
  const ideas = useStore((s) => s.ideas);
  const addIdea = useStore((s) => s.addIdea);
  const editIdea = useStore((s) => s.editIdea);
  const deleteIdea = useStore((s) => s.deleteIdea);

  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eBody, setEBody] = useState('');
  const [eTags, setETags] = useState('');

  const allTags = [...new Set(ideas.flatMap((i) => i.tags))].sort();
  const visible = ideas.filter((i) => matches(search, activeTag, i.title, i.body, i.tags));

  function submit() {
    if (!title.trim()) return;
    addIdea(title.trim(), body.trim(), parseTags(tagsStr));
    setTitle(''); setBody(''); setTagsStr(''); setShowForm(false);
  }
  function startEdit(i: Idea) {
    setEditingId(i.id); setETitle(i.title); setEBody(i.body); setETags(i.tags.join(', '));
  }
  function saveEdit() {
    if (!editingId) return;
    editIdea(editingId, { title: eTitle.trim() || 'Untitled', body: eBody, tags: parseTags(eTags) });
    setEditingId(null);
  }

  return (
    <div>
      <FilterBar search={search} setSearch={setSearch} tags={allTags} activeTag={activeTag} setActiveTag={setActiveTag} />

      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={{ ...btnGhost, marginBottom: 14 }}>+ New idea</button>
      ) : (
        <div style={{ ...card, padding: 14, border: '1px solid var(--accent)', marginBottom: 14, maxWidth: 640 }}>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Idea title"
            style={{ ...inputStyle, width: '100%', marginBottom: 8, fontWeight: 600 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Describe it — or dictate…"
              style={{ ...inputStyle, flex: 1, resize: 'vertical', lineHeight: 1.6 }} />
            <MicButton onText={(t) => setBody((b) => (b ? b + ' ' : '') + t)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <TagsInput value={tagsStr} onChange={setTagsStr} />
            <button onClick={submit} style={btnPrimary}>Add idea</button>
            <button onClick={() => setShowForm(false)} style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ columnCount: 3, columnGap: 12 }}>
        {visible.map((idea) => (
          <div key={idea.id} style={{ ...card, padding: '12px 14px', breakInside: 'avoid', marginBottom: 12, borderLeft: `4px solid ${idea.color}` }}>
            {editingId === idea.id ? (
              <>
                <input value={eTitle} onChange={(e) => setETitle(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: 6, fontWeight: 600 }} />
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
                  <textarea value={eBody} onChange={(e) => setEBody(e.target.value)} rows={4}
                    style={{ ...inputStyle, flex: 1, resize: 'vertical', lineHeight: 1.6, fontSize: 12.5 }} />
                  <MicButton onText={(t) => setEBody((b) => (b ? b + ' ' : '') + t)} />
                </div>
                <TagsInput value={eTags} onChange={setETags} />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={saveEdit} style={btnPrimary}>Save</button>
                  <button onClick={() => setEditingId(null)} style={btnGhost}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--ink)' }}>{idea.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--mut)', lineHeight: 1.5, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{idea.body}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  {idea.tags.map((tag) => (
                    <span key={tag} style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", color: 'var(--faint)', background: 'var(--bg)', border: '1px solid var(--line2)', borderRadius: 2, padding: '1px 6px' }}>#{tag}</span>
                  ))}
                  <span style={{ marginLeft: 'auto' }} />
                  <button onClick={() => startEdit(idea)} style={{ ...btnGhost, padding: '1px 7px', fontSize: 10.5 }}>Edit</button>
                  <button onClick={() => { if (confirm(`Delete idea "${idea.title}"?`)) deleteIdea(idea.id); }}
                    style={{ ...btnGhost, padding: '1px 7px', fontSize: 10.5, color: 'var(--p1)', borderColor: 'var(--p1)' }}>✕</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {visible.length === 0 && (
        <div style={{ ...card, padding: 20, maxWidth: 640, fontSize: 12.5, color: 'var(--mut)', fontStyle: 'italic' }}>
          {ideas.length ? 'No ideas match your search.' : 'No ideas yet.'}
        </div>
      )}
    </div>
  );
}

// ── Journal tab ───────────────────────────────────────────────────────────────
function JournalTab() {
  const journalEntries = useStore((s) => s.journalEntries);
  const addJournalEntry = useStore((s) => s.addJournalEntry);
  const editJournalEntry = useStore((s) => s.editJournalEntry);
  const deleteJournalEntry = useStore((s) => s.deleteJournalEntry);

  const [search, setSearch] = useState('');
  const [draftText, setDraftText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eText, setEText] = useState('');

  const visible = journalEntries.filter((j) => !search.trim() || `${j.date} ${j.text}`.toLowerCase().includes(search.toLowerCase()));

  function handleSave() {
    if (!draftText.trim()) return;
    addJournalEntry(draftText.trim());
    setDraftText('');
  }

  return (
    <div>
      <FilterBar search={search} setSearch={setSearch} tags={[]} activeTag={null} setActiveTag={() => {}} />

      {/* Write entry */}
      <div style={{ ...card, padding: 20, marginBottom: 16, maxWidth: 680 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Write a new entry</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)}
            placeholder="What's on your mind today? Type or dictate 🎤" rows={5}
            style={{
              ...inputStyle, flex: 1, fontSize: 14, fontFamily: "'Newsreader', serif", fontStyle: 'italic',
              resize: 'vertical', lineHeight: 1.7,
            }} />
          <MicButton onText={(t) => setDraftText((b) => (b ? b + ' ' : '') + t)} />
        </div>
        <button onClick={handleSave} style={{ ...btnPrimary, marginTop: 8 }}>Save</button>
      </div>

      {/* Entries */}
      {visible.map((entry) => (
        <div key={entry.id} style={{ ...card, padding: 24, maxWidth: 680, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: "'Newsreader', serif", fontSize: 18, color: 'var(--ink)' }}>{entry.date}</span>
            <span style={{ marginLeft: 'auto' }} />
            {editingId !== entry.id && (
              <>
                <button onClick={() => { setEditingId(entry.id); setEText(entry.text); }} style={{ ...btnGhost, padding: '1px 8px', fontSize: 10.5 }}>Edit</button>
                <button onClick={() => { if (confirm('Delete this journal entry?')) deleteJournalEntry(entry.id); }}
                  style={{ ...btnGhost, padding: '1px 8px', fontSize: 10.5, color: 'var(--p1)', borderColor: 'var(--p1)' }}>✕</button>
              </>
            )}
          </div>
          <div style={{ height: 1, background: 'var(--line2)', marginTop: 10 }} />
          {editingId === entry.id ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <textarea value={eText} onChange={(e) => setEText(e.target.value)} rows={6}
                  style={{ ...inputStyle, flex: 1, fontSize: 14, fontFamily: "'Newsreader', serif", fontStyle: 'italic', resize: 'vertical', lineHeight: 1.7 }} />
                <MicButton onText={(t) => setEText((b) => (b ? b + ' ' : '') + t)} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => { editJournalEntry(entry.id, eText); setEditingId(null); }} style={btnPrimary}>Save</button>
                <button onClick={() => setEditingId(null)} style={btnGhost}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 15, lineHeight: 1.8, color: 'var(--ink2)', marginTop: 14, whiteSpace: 'pre-wrap' }}>
              {entry.text}
            </div>
          )}
        </div>
      ))}
      {visible.length === 0 && (
        <div style={{ ...card, padding: 24, maxWidth: 680, fontSize: 12.5, color: 'var(--mut)', fontStyle: 'italic' }}>
          {journalEntries.length ? 'No entries match your search.' : 'No journal entries yet — write your first one above.'}
        </div>
      )}
    </div>
  );
}

interface Props {
  setScreen?: (s: Screen) => void;
}

export default function IdeasJournal({ setScreen: _setScreen }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Notes');
  const noteCount = useStore((s) => s.notes.length);
  const ideaCount = useStore((s) => s.ideas.length);
  const journalCount = useStore((s) => s.journalEntries.length);
  const counts: Record<Tab, number> = { Notes: noteCount, Ideas: ideaCount, Journal: journalCount };
  const tabs: Tab[] = ['Notes', 'Ideas', 'Journal'];

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {tabs.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 14px', borderRadius: 3, fontSize: 13, fontWeight: 500,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: activeTab === tab ? 'var(--ink)' : 'transparent',
              color: activeTab === tab ? 'var(--ink-contrast)' : 'var(--mut)',
            }}>
            {tab} <span style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", opacity: 0.7 }}>{counts[tab]}</span>
          </button>
        ))}
      </div>

      {activeTab === 'Notes' && <NotesTab />}
      {activeTab === 'Ideas' && <IdeasTab />}
      {activeTab === 'Journal' && <JournalTab />}
    </div>
  );
}
