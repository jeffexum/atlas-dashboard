import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import type { Screen } from '../App';

const card: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

type Tab = 'Ideas' | 'Journal' | 'Voice Notes';

const VOICE_NOTES = [
  { title: 'Product brainstorm', duration: '2:14', date: 'Jun 27' },
  { title: 'Book reflection – The Creative Act', duration: '4:38', date: 'Jun 24' },
  { title: 'Weekly review notes', duration: '6:52', date: 'Jun 22' },
];

const AVAILABLE_TAGS = ['dev', 'product', 'ux', 'personal'];

interface Props {
  setScreen?: (s: Screen) => void;
}

function IdeasTab() {
  const ideas = useStore((s) => s.ideas);
  const addIdea = useStore((s) => s.addIdea);

  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function handleSubmit() {
    if (!newTitle.trim()) return;
    addIdea(newTitle.trim(), newBody.trim(), selectedTags);
    setNewTitle('');
    setNewBody('');
    setSelectedTags([]);
    setShowForm(false);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
      {/* Masonry ideas */}
      <div>
        {/* New idea button */}
        <div style={{ marginBottom: 12 }}>
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              style={{
                padding: '6px 14px',
                fontSize: 12.5,
                border: '1px solid var(--line)',
                borderRadius: 3,
                background: 'var(--card)',
                color: 'var(--ink2)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              + New idea
            </button>
          ) : (
            <div style={{ ...card, padding: 14, border: '1px solid var(--accent)', marginBottom: 12 }}>
              <input
                autoFocus
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Idea title"
                style={{
                  width: '100%',
                  border: '1px solid var(--line)',
                  borderRadius: 3,
                  padding: '6px 8px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  color: 'var(--ink)',
                  background: 'var(--bg)',
                  outline: 'none',
                  marginBottom: 8,
                  boxSizing: 'border-box',
                }}
              />
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Describe your idea..."
                rows={3}
                style={{
                  width: '100%',
                  border: '1px solid var(--line)',
                  borderRadius: 3,
                  padding: '6px 8px',
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                  color: 'var(--ink)',
                  background: 'var(--bg)',
                  outline: 'none',
                  resize: 'vertical',
                  marginBottom: 8,
                  boxSizing: 'border-box',
                  lineHeight: 1.5,
                }}
              />
              {/* Tag chips */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                {AVAILABLE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      fontFamily: "'JetBrains Mono', monospace",
                      border: `1px solid ${selectedTags.includes(tag) ? 'var(--accent)' : 'var(--line2)'}`,
                      borderRadius: 2,
                      background: selectedTags.includes(tag) ? 'var(--accentbg)' : 'var(--bg)',
                      color: selectedTags.includes(tag) ? 'var(--accent)' : 'var(--faint)',
                      cursor: 'pointer',
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleSubmit}
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
                  Add idea
                </button>
                <button
                  onClick={() => setShowForm(false)}
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

        <div style={{ columnCount: 2, columnGap: 12 }}>
          {ideas.map((idea) => (
            <div
              key={idea.id}
              style={{
                ...card,
                padding: '12px 14px',
                breakInside: 'avoid',
                marginBottom: 12,
                borderLeft: `4px solid ${idea.color}`,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--ink)' }}>
                {idea.title}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--mut)', lineHeight: 1.5, marginBottom: 8 }}>
                {idea.body}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {idea.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 10.5,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: 'var(--faint)',
                      background: 'var(--bg)',
                      border: '1px solid var(--line2)',
                      borderRadius: 2,
                      padding: '1px 6px',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Journal entry sidebar */}
      <div style={{ ...card, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: "'Newsreader', serif", fontSize: 16, color: 'var(--ink)' }}>
            Monday, June 29
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--faint)' }}>
            2026
          </span>
        </div>
        <div style={{ height: 1, background: 'var(--line2)', marginTop: 8, marginBottom: 0 }} />
        <div
          style={{
            fontFamily: "'Newsreader', serif",
            fontStyle: 'italic',
            fontSize: 15,
            lineHeight: 1.75,
            color: 'var(--ink2)',
            marginTop: 12,
          }}
        >
          <p style={{ margin: '0 0 12px 0' }}>
            Today felt productive despite the morning chaos. The Q2 review prep is hanging over me,
            but the focus block Scout added actually helped — got 60% of the slides done before
            lunch. Had a good conversation with Sarah about the server issues; feels resolved now.
          </p>
          <p style={{ margin: 0 }}>
            Need to think more carefully about how I'm prioritizing. Three P1 tasks sitting in my
            inbox is a sign I've been avoiding hard conversations...
          </p>
        </div>
        <div
          style={{
            marginTop: 16,
            background: 'var(--accentbg)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 'var(--radius-card)',
            padding: '10px 12px',
            fontSize: 12,
            color: 'var(--ink2)',
          }}
        >
          Scout: Based on today's patterns, consider blocking 8–9am tomorrow for email triage
          before your calendar fills up.
        </div>
      </div>
    </div>
  );
}

function JournalTab() {
  const journalEntries = useStore((s) => s.journalEntries);
  const addJournalEntry = useStore((s) => s.addJournalEntry);

  const [draftText, setDraftText] = useState('');

  function handleSave() {
    if (!draftText.trim()) return;
    addJournalEntry(draftText.trim());
    setDraftText('');
  }

  return (
    <div>
      {/* Write entry area */}
      <div style={{ ...card, padding: 20, marginBottom: 16, maxWidth: 680 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
          Write a new entry
        </div>
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="What's on your mind today?"
          rows={5}
          style={{
            width: '100%',
            border: '1px solid var(--line)',
            borderRadius: 3,
            padding: '8px 10px',
            fontSize: 14,
            fontFamily: "'Newsreader', serif",
            fontStyle: 'italic',
            color: 'var(--ink)',
            background: 'var(--bg)',
            outline: 'none',
            resize: 'vertical',
            lineHeight: 1.7,
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleSave}
          style={{
            marginTop: 8,
            padding: '5px 14px',
            fontSize: 12.5,
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 3,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Save
        </button>
      </div>

      {/* Existing entries */}
      {journalEntries.map((entry) => (
        <div key={entry.id} style={{ ...card, padding: 24, maxWidth: 680, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: "'Newsreader', serif", fontSize: 18, color: 'var(--ink)' }}>
              {entry.date}
            </span>
          </div>
          <div style={{ height: 1, background: 'var(--line2)', marginTop: 10, marginBottom: 0 }} />
          <div
            style={{
              fontFamily: "'Newsreader', serif",
              fontStyle: 'italic',
              fontSize: 15,
              lineHeight: 1.8,
              color: 'var(--ink2)',
              marginTop: 14,
              whiteSpace: 'pre-wrap',
            }}
          >
            {entry.text}
          </div>
        </div>
      ))}

      {/* Existing static entry */}
      <div style={{ ...card, padding: 24, maxWidth: 680, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: "'Newsreader', serif", fontSize: 18, color: 'var(--ink)' }}>
            Sunday, June 28
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--faint)' }}>
            2026
          </span>
        </div>
        <div style={{ height: 1, background: 'var(--line2)', marginTop: 10, marginBottom: 0 }} />
        <div
          style={{
            fontFamily: "'Newsreader', serif",
            fontStyle: 'italic',
            fontSize: 15,
            lineHeight: 1.8,
            color: 'var(--ink2)',
            marginTop: 14,
          }}
        >
          <p style={{ margin: '0 0 14px 0' }}>
            Slow Sunday. Spent the morning reading — finished two more chapters of The Creative Act.
            The section on "following the work" resonated more than expected. I've been forcing too
            many things lately rather than letting them develop naturally.
          </p>
          <p style={{ margin: '0 0 14px 0' }}>
            Did the weekly review in the afternoon. Goals are mostly on track except running — I'm
            behind pace after the knee thing last month. Adjusted the weekly target down to 18 miles
            to be realistic without giving up entirely.
          </p>
          <p style={{ margin: 0 }}>
            Good dinner with the family. Sometimes the best thing is stepping away from the screen
            entirely. Starting the week with that energy feels right.
          </p>
        </div>
        <div
          style={{
            marginTop: 18,
            background: 'var(--accentbg)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 'var(--radius-card)',
            padding: '10px 12px',
            fontSize: 12,
            color: 'var(--ink2)',
          }}
        >
          Scout: Your last 4 Sunday entries show a consistent reflection pattern — you might enjoy
          turning this into a structured weekly template.
        </div>
      </div>
    </div>
  );
}

function VoiceNotesTab() {
  return (
    <div>
      {VOICE_NOTES.map((note) => (
        <div
          key={note.title}
          style={{
            ...card,
            padding: '14px 16px',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--accentbg)', border: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, flexShrink: 0, cursor: 'pointer',
            }}
          >
            ▶
          </div>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
            {note.title}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--faint)' }}>
            {note.duration}
          </div>
          <div style={{ fontSize: 11, color: 'var(--mut)' }}>{note.date}</div>
        </div>
      ))}
    </div>
  );
}

export default function IdeasJournal({ setScreen: _setScreen }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Ideas');
  const tabs: Tab[] = ['Ideas', 'Journal', 'Voice Notes'];

  return (
    <div>
      {/* Tab row */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 14px',
              borderRadius: 3,
              fontSize: 13,
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: activeTab === tab ? 'var(--ink)' : 'transparent',
              color: activeTab === tab ? 'white' : 'var(--mut)',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Ideas' && <IdeasTab />}
      {activeTab === 'Journal' && <JournalTab />}
      {activeTab === 'Voice Notes' && <VoiceNotesTab />}
    </div>
  );
}
