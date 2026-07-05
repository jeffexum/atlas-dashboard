import React, { useState } from 'react';
import { useStore, addDelegation, delegationStatus, deleteDelegation } from '../store/useStore';

const API = import.meta.env.VITE_API_URL || '';

const cardBase: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  open:    { label: 'open',      color: 'var(--mut)',            bg: 'var(--bg)' },
  nudged:  { label: 'due soon',  color: 'oklch(0.5 0.15 60)',    bg: 'oklch(0.96 0.06 75)' },
  slipped: { label: 'slipped',   color: 'oklch(0.5 0.19 27)',    bg: 'oklch(0.95 0.05 27)' },
  done:    { label: 'done',      color: 'oklch(0.45 0.14 150)',  bg: 'oklch(0.94 0.06 150)' },
};

const btn: React.CSSProperties = {
  padding: '3px 10px', fontSize: 11.5, border: '1px solid var(--line)', borderRadius: 5,
  background: 'transparent', color: 'var(--ink2)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
};

export default function Delegations() {
  const delegations = useStore((s) => s.delegations);
  const [showAdd, setShowAdd] = useState(false);
  const [newWhat, setNewWhat] = useState('');
  const [newWho, setNewWho] = useState('');
  const [newDue, setNewDue] = useState('');
  const [scanning, setScanning] = useState(false);
  const [nudging, setNudging] = useState<string | null>(null);

  const active = delegations.filter((d) => d.status !== 'done')
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const done = delegations.filter((d) => d.status === 'done').slice(-10).reverse();

  async function handleAdd() {
    if (!newWhat.trim() || !newWho.trim()) return;
    await addDelegation(newWhat.trim(), newWho.trim(), newDue || undefined);
    setNewWhat(''); setNewWho(''); setNewDue(''); setShowAdd(false);
  }

  async function handleScan() {
    setScanning(true);
    try { await fetch(`${API}/api/delegations/extract`, { method: 'POST' }); }
    finally { setScanning(false); }
  }

  // Ask Adler to draft a chase email for this delegation
  async function handleNudge(id: string) {
    const d = delegations.find((x) => x.id === id);
    if (!d) return;
    setNudging(id);
    try {
      await fetch(`${API}/api/whiteboard/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: [{ role: 'user', text: `Create a draft (do NOT send) chasing ${d.who} on: "${d.what}"${d.dueDate ? ` (due ${d.dueDate})` : ''}. ${d.sourceCommId ? `Link it to email ${d.sourceCommId} so it replies in-thread.` : 'Keep it short and friendly, in my voice.'}` }],
          sessionId: `nudge-${id}`,
        }),
      });
    } finally { setNudging(null); }
  }

  return (
    <div style={{ padding: 16, maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => setShowAdd((v) => !v)}
          style={{ ...btn, background: showAdd ? 'transparent' : 'var(--accent)', color: showAdd ? 'var(--mut)' : '#fff', border: showAdd ? '1px solid var(--line)' : 'none', padding: '6px 14px', fontWeight: 600 }}>
          {showAdd ? 'Cancel' : '+ Track something'}
        </button>
        <button onClick={handleScan} disabled={scanning} style={{ ...btn, padding: '6px 14px' }}>
          {scanning ? 'Scanning…' : '✦ Scan inbox for commitments'}
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--faint)', fontFamily: 'JetBrains Mono, monospace' }}>
          {active.length} open
        </span>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ ...cardBase, padding: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input autoFocus value={newWhat} onChange={(e) => setNewWhat(e.target.value)} placeholder="What are you waiting on?"
            style={{ flex: 2, minWidth: 220, border: '1px solid var(--line)', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg)', outline: 'none' }} />
          <input value={newWho} onChange={(e) => setNewWho(e.target.value)} placeholder="Who owes it"
            style={{ flex: 1, minWidth: 130, border: '1px solid var(--line)', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg)', outline: 'none' }} />
          <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)}
            style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px', fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--bg)', outline: 'none' }} />
          <button onClick={handleAdd} disabled={!newWhat.trim() || !newWho.trim()}
            style={{ ...btn, background: 'var(--accent)', color: '#fff', border: 'none', padding: '7px 16px', fontWeight: 600, opacity: newWhat.trim() && newWho.trim() ? 1 : 0.5 }}>
            Track
          </button>
        </div>
      )}

      {/* Active list */}
      {active.length === 0 && (
        <div style={{ ...cardBase, padding: '36px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🤝</div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Nothing you're waiting on</div>
          <div style={{ fontSize: 12.5, color: 'var(--mut)', lineHeight: 1.6 }}>
            Commitments are extracted from your email automatically after each sync — or add one manually,
            or tell Adler "track that Mike owes me the redline by Friday".
          </div>
        </div>
      )}
      {active.map((d) => {
        const st = STATUS_STYLE[d.status];
        return (
          <div key={d.id} style={{ ...cardBase, padding: '12px 14px', borderLeft: `3px solid ${d.status === 'slipped' ? 'var(--p1)' : d.status === 'nudged' ? 'var(--p2)' : 'var(--line)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', flex: 1, minWidth: 200 }}>{d.what}</span>
              <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{st.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--ink2)' }}>👤 {d.who}</span>
              {d.dueDate && <span style={{ fontSize: 11.5, color: 'var(--mut)', fontFamily: 'JetBrains Mono, monospace' }}>due {d.dueDate}</span>}
              {d.sourceQuote && <span style={{ fontSize: 11.5, color: 'var(--faint)', fontStyle: 'italic', flex: 1, minWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>"{d.sourceQuote}"</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button style={{ ...btn, color: 'var(--accent)', borderColor: 'var(--accent)' }} onClick={() => delegationStatus(d.id, 'done')}>✓ Delivered</button>
                <button style={btn} disabled={nudging === d.id} onClick={() => handleNudge(d.id)}>{nudging === d.id ? 'Drafting…' : '✉ Draft nudge'}</button>
                <button style={{ ...btn, color: 'var(--faint)' }} onClick={() => deleteDelegation(d.id)}>✕</button>
              </span>
            </div>
          </div>
        );
      })}

      {/* Recently delivered */}
      {done.length > 0 && (
        <div style={{ ...cardBase, padding: '10px 14px' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--faint)', marginBottom: 6 }}>Recently delivered</div>
          {done.map((d) => (
            <div key={d.id} style={{ fontSize: 12.5, color: 'var(--mut)', padding: '3px 0', textDecoration: 'line-through' }}>
              {d.who} — {d.what}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
