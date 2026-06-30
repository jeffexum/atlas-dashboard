import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import type { Screen } from '../App';

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
};

const priorityColor = (p: string) => {
  if (p === 'p1') return 'var(--p1)';
  if (p === 'p2') return 'var(--p2)';
  return 'var(--p3)';
};

const smallBtn: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '11.5px',
  border: '1px solid var(--line)',
  borderRadius: '3px',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--ink2)',
  fontFamily: "'Schibsted Grotesk', sans-serif",
};

interface Props {
  setScreen?: (s: Screen) => void;
}

export default function Inbox({ setScreen: _setScreen }: Props) {
  const comms = useStore((s) => s.comms);
  const drafts = useStore((s) => s.drafts);
  const proposedActions = useStore((s) => s.proposedActions);
  const snoozeComm = useStore((s) => s.snoozeComm);
  const addTodoFromComm = useStore((s) => s.addTodoFromComm);
  const sendDraft = useStore((s) => s.sendDraft);
  const discardDraft = useStore((s) => s.discardDraft);
  const acceptAction = useStore((s) => s.acceptAction);
  const dismissAction = useStore((s) => s.dismissAction);
  const draftReplyForComm = useStore((s) => s.draftReplyForComm);

  const [draftedId, setDraftedId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [recentlyDiscarded, setRecentlyDiscarded] = useState<string | null>(null);
  const undoDiscardDraft = useStore((s) => s.undoDiscardDraft);
  const updateDraftText = useStore((s) => s.updateDraftText);

  function handleDiscard(id: string) {
    discardDraft(id);
    setRecentlyDiscarded(id);
    setTimeout(() => setRecentlyDiscarded((cur) => (cur === id ? null : cur)), 5000);
  }

  function handleUndo(id: string) {
    undoDiscardDraft(id);
    setRecentlyDiscarded(null);
  }

  function handleEdit(id: string, currentText: string) {
    setEditingDraftId(id);
    setEditText(currentText);
  }

  function handleSaveEdit(id: string) {
    updateDraftText(id, editText);
    setEditingDraftId(null);
  }

  const readyDrafts = drafts.filter((d) => d.status === 'ready' || d.status === 'sent' || d.status === 'discarded');
  const readyDraftCount = drafts.filter((d) => d.status === 'ready').length;

  function handleDraftReply(commId: string) {
    draftReplyForComm(commId);
    setDraftedId(commId);
    setTimeout(() => setDraftedId(null), 1500);
  }

  return (
    <div
      style={{
        padding: '20px',
        background: 'var(--bg)',
        minHeight: '100vh',
        fontFamily: "'Schibsted Grotesk', sans-serif",
        color: 'var(--ink)',
        display: 'grid',
        gridTemplateColumns: '1fr 372px',
        gap: '16px',
        alignItems: 'start',
      }}
    >
      {/* Left column */}
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: 'var(--ink)' }}>Messages</h2>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              padding: '2px 7px',
              borderRadius: '10px',
              background: 'var(--ink)',
              color: '#fff',
            }}
          >
            {comms.length}
          </span>
        </div>

        {/* Scout callout */}
        <div
          style={{
            background: 'var(--accentbg)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 'var(--radius-card)',
            padding: '10px 14px',
            marginBottom: '12px',
            fontSize: '13px',
            color: 'var(--ink2)',
          }}
        >
          Scout processed 8 messages. 2 require immediate action, 3 drafts are ready to send.
        </div>

        {/* Messages */}
        <div>
          {comms.map((comm) => (
            <div
              key={comm.id}
              style={{
                ...cardBase,
                padding: 0,
                marginBottom: '8px',
                borderLeft: `3px solid ${priorityColor(comm.priority)}`,
                opacity: comm.status === 'snoozed' ? 0.45 : 1,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '10px 12px' }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '10px',
                      padding: '2px 6px',
                      background: 'var(--bg)',
                      border: '1px solid var(--line)',
                      borderRadius: '2px',
                      color: 'var(--mut)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {comm.source}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{comm.who}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--faint)' }}>{comm.time}</span>
                </div>

                {/* Subject */}
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginTop: '4px' }}>{comm.subject}</div>

                {/* Preview */}
                <div style={{ fontSize: '12px', color: 'var(--mut)', marginTop: '2px' }}>{comm.preview}</div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button
                    style={{
                      ...smallBtn,
                      ...(draftedId === comm.id
                        ? { background: 'var(--accentbg)', color: 'var(--accent)', borderColor: 'var(--accent)' }
                        : {}),
                    }}
                    onClick={() => handleDraftReply(comm.id)}
                  >
                    {draftedId === comm.id ? 'Draft ready ✓' : 'Draft Reply'}
                  </button>
                  <button style={smallBtn} onClick={() => addTodoFromComm(comm.id)}>Add to-do</button>
                  <button style={smallBtn} onClick={() => snoozeComm(comm.id)}>Snooze</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Drafts Ready */}
        <div style={{ ...cardBase }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span style={eyebrow}>Drafts Ready</span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11px',
                padding: '2px 7px',
                borderRadius: '10px',
                background: 'var(--accentbg)',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
              }}
            >
              {readyDraftCount}
            </span>
          </div>

          {readyDrafts.map((draft, idx) => (
            <div key={draft.id}>
              {idx > 0 && <div style={{ height: '1px', background: 'var(--line2)', margin: '12px 0' }} />}
              <div style={{ opacity: draft.status === 'discarded' ? 0.4 : 1 }}>
                <div style={{ fontSize: '12px', color: 'var(--mut)', marginBottom: '2px' }}>
                  <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>To:</span> {draft.to}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--mut)', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>Re:</span> {draft.re}
                </div>

                {editingDraftId === draft.id ? (
                  <div style={{ margin: '6px 0' }}>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '90px',
                        padding: '8px',
                        fontSize: '13px',
                        fontFamily: "'Newsreader', serif",
                        fontStyle: 'italic',
                        color: 'var(--ink2)',
                        lineHeight: 1.5,
                        border: '1px solid var(--accent)',
                        borderRadius: '3px',
                        resize: 'vertical',
                        background: 'var(--accentbg)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                      <button
                        onClick={() => handleSaveEdit(draft.id)}
                        style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontFamily: "'Schibsted Grotesk', sans-serif" }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingDraftId(null)}
                        style={{ padding: '4px 10px', fontSize: '11px', background: 'transparent', color: 'var(--mut)', border: '1px solid var(--line)', borderRadius: '3px', cursor: 'pointer', fontFamily: "'Schibsted Grotesk', sans-serif" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      background: 'var(--accentbg)',
                      borderLeft: '2px solid var(--accent)',
                      padding: '8px',
                      borderRadius: '3px',
                      margin: '6px 0',
                      fontFamily: "'Newsreader', serif",
                      fontStyle: 'italic',
                      fontSize: '13px',
                      color: 'var(--ink2)',
                      lineHeight: 1.5,
                      textDecoration: draft.status === 'discarded' ? 'line-through' : 'none',
                    }}
                  >
                    {draft.text.slice(0, 100)}...
                  </div>
                )}

                {draft.status === 'sent' ? (
                  <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 500, marginTop: '6px' }}>Sent ✓</div>
                ) : draft.status === 'discarded' ? (
                  recentlyDiscarded === draft.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <span style={{ fontSize: '11.5px', color: 'var(--mut)' }}>Discarded</span>
                      <button
                        onClick={() => handleUndo(draft.id)}
                        style={{ padding: '3px 9px', fontSize: '11px', background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '3px', cursor: 'pointer', fontFamily: "'Schibsted Grotesk', sans-serif", fontWeight: 500 }}
                      >
                        Undo
                      </button>
                    </div>
                  ) : null
                ) : draft.status === 'ready' && editingDraftId !== draft.id ? (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button
                      onClick={() => sendDraft(draft.id)}
                      style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontFamily: "'Schibsted Grotesk', sans-serif" }}
                    >
                      Send
                    </button>
                    <button
                      onClick={() => handleEdit(draft.id, draft.text)}
                      style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--line2)', color: 'var(--ink2)', border: '1px solid var(--line)', borderRadius: '3px', cursor: 'pointer', fontFamily: "'Schibsted Grotesk', sans-serif" }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDiscard(draft.id)}
                      style={{ padding: '4px 10px', fontSize: '11px', background: 'transparent', color: 'var(--mut)', border: '1px solid var(--line)', borderRadius: '3px', cursor: 'pointer', fontFamily: "'Schibsted Grotesk', sans-serif" }}
                    >
                      Discard
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Proposed Actions */}
        <div style={{ ...cardBase }}>
          <div style={{ marginBottom: '14px' }}>
            <span style={eyebrow}>Proposed Actions</span>
          </div>

          {proposedActions.map((action, idx) => (
            <div key={action.id}>
              {idx > 0 && <div style={{ height: '1px', background: 'var(--line2)', margin: '10px 0' }} />}
              <div
                style={{
                  opacity: action.status === 'dismissed' ? 0.35 : 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: 'var(--accentbg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      flexShrink: 0,
                      marginTop: '1px',
                    }}
                  >
                    {action.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.4 }}>{action.text}</div>
                    <div style={{ fontSize: '11px', color: 'var(--mut)', marginTop: '2px' }}>{action.meta}</div>
                  </div>
                </div>

                {action.status === 'accepted' ? (
                  <div style={{ fontSize: '11.5px', color: 'oklch(0.42 0.12 150)', fontWeight: 500, paddingLeft: '28px' }}>Accepted ✓</div>
                ) : action.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: '6px', paddingLeft: '28px' }}>
                    <button
                      onClick={() => acceptAction(action.id)}
                      style={{
                        padding: '3px 9px',
                        fontSize: '11px',
                        background: 'var(--accentbg)',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontFamily: "'Schibsted Grotesk', sans-serif",
                      }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => dismissAction(action.id)}
                      style={{
                        padding: '3px 9px',
                        fontSize: '11px',
                        background: 'transparent',
                        color: 'var(--faint)',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: "'Schibsted Grotesk', sans-serif",
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
