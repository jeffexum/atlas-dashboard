import React, { useState } from 'react';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
import { useStore, notifyError, setEditingDraft } from '../store/useStore';
import type { Draft } from '../store/useStore';
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


// ── Scheduler side pane ───────────────────────────────────────────────────────
// Merged-calendar availability with clickable slots and a Sundial-style
// timezone strip. Read-only: clicking inserts an offer line into the draft.

interface ScheduleSlot { startHour: number; epoch: number; label: string; date: string; label2: string }
interface ScheduleDay { date: string; label: string; busy: { start: number; end: number; title: string }[]; slots: { startHour: number; epoch: number; label: string }[] }
interface ScheduleData { tz: string; days: ScheduleDay[]; suggested: ScheduleSlot[] }

const TZ_OPTIONS = [
  ['America/Denver', 'Denver'], ['America/Los_Angeles', 'Pacific'], ['America/Chicago', 'Central'],
  ['America/New_York', 'Eastern'], ['Europe/London', 'London'], ['Europe/Berlin', 'Berlin'],
  ['Asia/Tokyo', 'Tokyo'], ['Australia/Sydney', 'Sydney'],
] as const;

function tzAbbrev(tz: string, epoch: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date(epoch)).find((p) => p.type === 'timeZoneName')?.value || tz;
  } catch { return tz; }
}

function fmtInTz(epoch: number, tz: string): string {
  return new Date(epoch).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
}

function SchedulerPane({ commId, myTz, onInsert }: { commId: string; myTz?: string; onInsert: (line: string) => void }) {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [duration, setDuration] = useState(30);
  const [theirTz, setTheirTz] = useState<string>('');
  const [tzGuessed, setTzGuessed] = useState(false);

  React.useEffect(() => {
    fetch(`${API_URL}/api/schedule/suggest?duration=${duration}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [duration]);

  React.useEffect(() => {
    fetch(`${API_URL}/api/schedule/tz-guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commId }),
    })
      .then((r) => r.json())
      .then((j: { tz?: string | null }) => { if (j.tz) { setTheirTz(j.tz); setTzGuessed(true); } })
      .catch(() => {});
  }, [commId]);

  if (!data) {
    return (
      <div style={{ width: 250, flexShrink: 0, borderLeft: '1px solid var(--line2)', padding: 14, fontSize: 12, color: 'var(--mut)' }}>
        Loading calendar…
      </div>
    );
  }

  const tz = data.tz || myTz || 'America/Denver';
  const showTheirs = theirTz && theirTz !== tz;
  const nowEpoch = Date.now();

  function insertSlot(s: ScheduleSlot) {
    const endEpoch = s.epoch + duration * 60_000;
    let line = `${s.label2.split(',')[0]}, ${new Date(s.epoch).toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' })} — ${fmtInTz(s.epoch, tz)}–${fmtInTz(endEpoch, tz)} ${tzAbbrev(tz, s.epoch)}`;
    if (showTheirs) line += ` (${fmtInTz(s.epoch, theirTz)} ${tzAbbrev(theirTz, s.epoch)} your time)`;
    onInsert(line);
  }

  // Sundial strip: hours 8–18 in my zone, mapped into theirs
  const stripHours: number[] = [];
  for (let h = 8; h <= 18; h += 2) stripHours.push(h);
  const todayBase = data.days[0] ? data.days[0].slots[0]?.epoch ?? nowEpoch : nowEpoch;
  // Anchor: epoch of 8am my-zone today ≈ first slot epoch minus its hour offset
  const firstSlot = data.days[0]?.slots[0];
  const anchor8am = firstSlot ? firstSlot.epoch - (firstSlot.startHour - 8) * 3600_000 : todayBase;

  return (
    <div style={{ width: 250, flexShrink: 0, borderLeft: '1px solid var(--line2)', padding: '10px 12px', background: 'var(--bg)', maxHeight: 480, overflowY: 'auto' }}>
      <div style={{ ...eyebrow, marginBottom: 8 }}>📅 Find a time</div>

      {/* Duration + their-TZ controls */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
          style={{ fontSize: 11, padding: '3px 4px', border: '1px solid var(--line)', borderRadius: 3, background: 'var(--card)', color: 'var(--ink2)', fontFamily: 'inherit' }}>
          <option value={15}>15 min</option><option value={30}>30 min</option>
          <option value={45}>45 min</option><option value={60}>1 hour</option>
        </select>
        <select value={theirTz} onChange={(e) => { setTheirTz(e.target.value); setTzGuessed(false); }}
          style={{ fontSize: 11, padding: '3px 4px', border: '1px solid var(--line)', borderRadius: 3, background: 'var(--card)', color: theirTz ? 'var(--ink2)' : 'var(--faint)', fontFamily: 'inherit', flex: 1, minWidth: 0 }}>
          <option value="">their timezone…</option>
          {TZ_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          {theirTz && !TZ_OPTIONS.some(([v]) => v === theirTz) && <option value={theirTz}>{theirTz.split('/')[1]?.replace('_', ' ')}</option>}
        </select>
      </div>
      {tzGuessed && showTheirs && (
        <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: -6, marginBottom: 8 }}>
          guessed from their email — override above
        </div>
      )}

      {/* Sundial timezone strip */}
      {showTheirs && (
        <div style={{ marginBottom: 12, border: '1px solid var(--line2)', borderRadius: 4, overflow: 'hidden' }}>
          {[tz, theirTz].map((zone, row) => (
            <div key={zone} style={{ display: 'flex', borderTop: row ? '1px solid var(--line2)' : 'none' }}>
              <div style={{ width: 34, fontSize: 8.5, fontFamily: "'JetBrains Mono', monospace", color: 'var(--faint)', padding: '3px 3px', flexShrink: 0 }}>
                {tzAbbrev(zone, nowEpoch)}
              </div>
              {stripHours.map((h) => {
                const ep = anchor8am + (h - 8) * 3600_000;
                const theirHour = parseInt(new Date(ep).toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', hour12: false }), 10);
                const business = theirHour >= 9 && theirHour < 17;
                return (
                  <div key={h} style={{ flex: 1, textAlign: 'center', fontSize: 8.5, fontFamily: "'JetBrains Mono', monospace", padding: '3px 0', background: business ? 'var(--accentbg)' : 'transparent', color: business ? 'var(--accent)' : 'var(--faint)' }}>
                    {new Date(ep).toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric' }).replace(' ', '').toLowerCase()}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Top suggestions */}
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--mut)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>Suggested</div>
      {data.suggested.map((s) => (
        <button key={s.epoch} onClick={() => insertSlot(s)}
          style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 5, padding: '6px 9px', fontSize: 11.5, border: '1px solid var(--accent)', borderRadius: 4, background: 'var(--accentbg)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}>
          {s.label2}
          {showTheirs && <span style={{ color: 'var(--mut)', fontSize: 10 }}> · {fmtInTz(s.epoch, theirTz)} theirs</span>}
        </button>
      ))}
      {data.suggested.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--mut)', marginBottom: 8 }}>No open slots in the next week.</div>}

      {/* Per-day slot chips */}
      {data.days.map((day) => (
        <div key={day.date} style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>
            {day.label}
            <span style={{ color: 'var(--faint)', fontWeight: 400 }}> · {day.busy.length ? `${day.busy.length} booked` : 'clear'}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {day.slots.slice(0, 8).map((s) => (
              <button key={s.epoch}
                onClick={() => insertSlot({ ...s, date: day.date, label2: `${day.label.split(' ')[0]}, ${s.label}` })}
                style={{ padding: '2px 7px', fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", border: '1px solid var(--line)', borderRadius: 3, background: 'var(--card)', color: 'var(--ink2)', cursor: 'pointer' }}>
                {s.label.replace(':00', '').replace(' ', '').toLowerCase()}
              </button>
            ))}
            {day.slots.length === 0 && <span style={{ fontSize: 10.5, color: 'var(--faint)' }}>fully booked</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// Inline reply composer — lives inside the expanded email, with Adler refinement
function DraftComposer({ draft, who, commId }: { draft: Draft; who: string; commId: string }) {
  const sendDraft = useStore((s) => s.sendDraft);
  const discardDraft = useStore((s) => s.discardDraft);
  const saveDraftText = useStore((s) => s.saveDraftText);
  const updateDraftText = useStore((s) => s.updateDraftText);
  const [refineInput, setRefineInput] = useState('');
  const [refining, setRefining] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [sending, setSending] = useState(false);

  // Insert an offered time before the signoff (or append), as a bulleted offer list.
  function insertTimeLine(line: string) {
    const text = draft.text;
    const bullet = `• ${line}`;
    const m = text.match(/\n(Best|Thanks|Cheers|Regards|Sincerely|Talk soon|—)[\s\S]*$/);
    const before = (m && m.index !== undefined ? text.slice(0, m.index) : text).trimEnd();
    const after = m && m.index !== undefined ? text.slice(m.index) : '\n';
    const block = /Would any of these work\?/.test(before)
      ? `\n${bullet}` // extend the existing offer list
      : `\n\nWould any of these work?\n${bullet}`;
    const next = `${before}${block}${after}`;
    updateDraftText(draft.id, next);
    saveDraftText(draft.id, next);
  }

  async function handleRefine() {
    if (!refineInput.trim() || refining) return;
    setRefining(true);
    try {
      const res = await fetch(`${API_URL}/api/drafts/${draft.id}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: refineInput.trim() }),
      });
      const json = await res.json() as { text?: string };
      if (json.text) updateDraftText(draft.id, json.text);
      setRefineInput('');
    } finally {
      setRefining(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 10,
        border: '1px solid var(--accent)',
        borderRadius: 8,
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--line2)', background: 'var(--accentbg)' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>✍ Reply to {who}</span>
        <span style={{ fontSize: 10.5, color: 'var(--mut)', fontFamily: "'JetBrains Mono', monospace" }}>
          sends in-thread
        </span>
        <button
          onClick={() => setShowScheduler((v) => !v)}
          style={{
            marginLeft: 'auto',
            padding: '3px 10px',
            fontSize: 11.5,
            border: `1px solid ${showScheduler ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: 12,
            background: showScheduler ? 'var(--accentbg)' : 'var(--card)',
            color: showScheduler ? 'var(--accent)' : 'var(--ink2)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          📅 Suggest times
        </button>
      </div>

      {/* Editor + optional scheduler pane */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <textarea
          value={draft.text}
          onChange={(e) => updateDraftText(draft.id, e.target.value)}
          onFocus={() => setEditingDraft(draft.id)}
          onBlur={(e) => { setEditingDraft(null); saveDraftText(draft.id, e.target.value); }}
          spellCheck
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 190,
            padding: '14px 16px',
            border: 'none',
            outline: 'none',
            resize: 'vertical',
            fontSize: 13.5,
            lineHeight: 1.75,
            fontFamily: "'Schibsted Grotesk', sans-serif",
            color: 'var(--ink)',
            background: 'var(--card)',
            boxSizing: 'border-box',
            whiteSpace: 'pre-wrap',
          }}
        />
        {showScheduler && <SchedulerPane commId={commId} onInsert={insertTimeLine} />}
      </div>

      {/* Adler refine bar */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderTop: '1px solid var(--line2)', alignItems: 'center' }}>
        <span style={{ fontSize: 14 }}>◎</span>
        <input
          type="text"
          value={refineInput}
          onChange={(e) => setRefineInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRefine(); }}
          placeholder={'Tell Adler how to change it… e.g. "shorter" or "mention the wire went out Tuesday"'}
          disabled={refining}
          style={{
            flex: 1,
            border: '1px solid var(--line)',
            borderRadius: 14,
            padding: '5px 12px',
            fontSize: 12.5,
            fontFamily: 'inherit',
            color: 'var(--ink)',
            background: 'var(--card)',
            outline: 'none',
            opacity: refining ? 0.6 : 1,
          }}
        />
        <button
          onClick={handleRefine}
          disabled={refining || !refineInput.trim()}
          style={{
            padding: '5px 14px',
            fontSize: 12,
            fontWeight: 600,
            background: 'var(--violet)',
            color: '#fff',
            border: 'none',
            borderRadius: 14,
            cursor: refining || !refineInput.trim() ? 'default' : 'pointer',
            opacity: refining || !refineInput.trim() ? 0.5 : 1,
            fontFamily: 'inherit',
          }}
        >
          {refining ? 'Refining…' : 'Refine'}
        </button>
      </div>

      {/* Footer actions */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--line2)', alignItems: 'center' }}>
        <button
          onClick={() => { if (sending) return; setSending(true); sendDraft(draft.id); }}
          disabled={sending}
          style={{
            padding: '6px 18px',
            fontSize: 13,
            fontWeight: 600,
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: sending ? 'default' : 'pointer',
            opacity: sending ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          {sending ? 'Sending…' : 'Send reply'}
        </button>
        <button
          onClick={() => discardDraft(draft.id)}
          style={{
            padding: '6px 14px',
            fontSize: 12.5,
            background: 'transparent',
            color: 'var(--mut)',
            border: '1px solid var(--line)',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Discard
        </button>
        <span style={{ fontSize: 11, color: 'var(--faint)', marginLeft: 'auto' }}>
          Edits save automatically
        </span>
      </div>
    </div>
  );
}

interface Props {
  setScreen?: (s: Screen) => void;
}

type MailSource = 'all' | 'work' | 'personal';

export default function Inbox({ setScreen: _setScreen }: Props) {
  const [source, setSource] = useState<MailSource>('all');
  const allComms = useStore((s) => s.comms).filter((c) => c.status !== 'dismissed');
  const dayPlan = useStore((s) => s.dayPlan);
  // Today's email block from the Day Builder: which emails are queued, when, drafts ready?
  const todayStr = new Date().toLocaleDateString('en-CA');
  const emailBlock = dayPlan?.date === todayStr
    ? dayPlan.blocks.find((b) => b.kind === 'email' && (b.commIds?.length || 0) > 0)
    : undefined;
  // Gmail comms are prefixed "gm-"; everything else is Outlook (work).
  const isPersonal = (id: string) => id.startsWith('gm-');
  const workCount = allComms.filter((c) => !isPersonal(c.id)).length;
  const personalCount = allComms.filter((c) => isPersonal(c.id)).length;
  const comms = source === 'all' ? allComms
    : source === 'personal' ? allComms.filter((c) => isPersonal(c.id))
    : allComms.filter((c) => !isPersonal(c.id));
  const dismissComm = useStore((s) => s.dismissComm);
  const drafts = useStore((s) => s.drafts);
  const proposedActions = useStore((s) => s.proposedActions);
  const snoozeComm = useStore((s) => s.snoozeComm);
  const addTodoFromComm = useStore((s) => s.addTodoFromComm);
  const sendDraft = useStore((s) => s.sendDraft);
  const discardDraft = useStore((s) => s.discardDraft);
  const acceptAction = useStore((s) => s.acceptAction);
  const dismissAction = useStore((s) => s.dismissAction);

  const [syncing, setSyncing] = useState(false);
  const [learning, setLearning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bodyCache, setBodyCache] = useState<Record<string, string>>({});
  const [loadingBody, setLoadingBody] = useState<string | null>(null);

  async function handleExpandComm(commId: string) {
    if (expandedId === commId) { setExpandedId(null); return; }
    setExpandedId(commId);
    if (bodyCache[commId]) return;
    setLoadingBody(commId);
    try {
      const res = await fetch(`${API_URL}/api/comms/${encodeURIComponent(commId)}/body`);
      const data = await res.json() as { body?: string };
      setBodyCache((prev) => ({ ...prev, [commId]: data.body || '(no body)' }));
    } catch {
      setBodyCache((prev) => ({ ...prev, [commId]: '(failed to load)' }));
    } finally {
      setLoadingBody(null);
    }
  }
  const userProfile = useStore((s) => s.userProfile);
  const [draftedId, setDraftedId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [recentlyDiscarded, setRecentlyDiscarded] = useState<string | null>(null);
  const undoDiscardDraft = useStore((s) => s.undoDiscardDraft);
  const saveDraftText = useStore((s) => s.saveDraftText);

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
    saveDraftText(id, editText); // persist to server, not just local state
    setEditingDraftId(null);
  }

  const readyDrafts = drafts.filter((d) => d.status === 'ready' || d.status === 'sent' || d.status === 'discarded');
  const readyDraftCount = drafts.filter((d) => d.status === 'ready').length;

  async function handleSync() {
    setSyncing(true);
    try { await fetch(`${API_URL}/api/outlook/sync`); } finally { setSyncing(false); }
  }

  async function handleLearn() {
    setLearning(true);
    try { await fetch(`${API_URL}/api/outlook/learn`, { method: 'POST' }); } finally { setLearning(false); }
  }

  function handleDownloadProfile() {
    const blob = new Blob([userProfile], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'user-profile.md'; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDraftReply(commId: string) {
    if (draftedId) return; // guard against double-clicks producing duplicate drafts
    setDraftedId(commId);
    setExpandedId(commId); // composer opens inline under the email
    try {
      const res = await fetch(`${API_URL}/api/drafts/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commId }),
      });
      if (!res.ok) notifyError('Adler could not draft a reply — try again');
    } catch {
      notifyError('Could not reach the server to draft a reply');
    }
    setDraftedId(null);
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
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <button onClick={handleSync} disabled={syncing} style={{ ...smallBtn, opacity: syncing ? 0.6 : 1 }}>
              {syncing ? 'Syncing…' : '↻ Sync'}
            </button>
            <button onClick={handleLearn} disabled={learning} style={{ ...smallBtn, opacity: learning ? 0.6 : 1 }}>
              {learning ? 'Learning…' : '✦ Learn my style'}
            </button>
            {userProfile && (
              <button onClick={handleDownloadProfile} style={smallBtn}>⬇ Profile.md</button>
            )}
            <a href={`${API_URL}/api/outlook/auth`} style={{ ...smallBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              🔑 Re-auth
            </a>
          </div>
        </div>

        {/* Today's email block (from the Day Builder) */}
        {emailBlock && (
          <div style={{ ...cardBase, marginBottom: 14, borderLeft: '4px solid var(--blue)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>✉ Today's email block</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--faint)' }}>
                {(() => { const f = (h: number) => { const hr = Math.floor(h); const m = h % 1 ? ':30' : ''; return hr === 12 ? `12${m}pm` : hr > 12 ? `${hr - 12}${m}pm` : `${hr}${m}am`; }; return `${f(emailBlock.start)}–${f(emailBlock.start + emailBlock.duration)}`; })()}
              </span>
              {dayPlan?.status === 'confirmed' && <span style={{ fontSize: 10, color: 'var(--accent)' }}>✓ on calendar</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(emailBlock.commIds || []).map((cid) => {
                const comm = allComms.find((c) => c.id === cid);
                const draft = drafts.find((d) => d.commId === cid && d.status === 'ready');
                if (!comm) return null;
                return (
                  <div key={cid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: priorityColor(comm.priority), flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{comm.who}</span>
                    <span style={{ color: 'var(--mut)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{comm.subject}</span>
                    <span style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", color: draft ? 'var(--accent)' : 'var(--faint)', flexShrink: 0 }}>
                      {draft ? '✓ draft ready' : 'no draft yet'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Source toggle: All / Work (Outlook) / Personal (Gmail) */}
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, marginBottom: 14, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8 }}>
          {([
            ['all', 'All', allComms.length],
            ['work', 'Work', workCount],
            ['personal', 'Personal', personalCount],
          ] as [MailSource, string, number][]).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setSource(key)}
              style={{
                padding: '5px 14px',
                fontSize: 12.5,
                fontWeight: source === key ? 600 : 400,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: source === key ? 'var(--card)' : 'transparent',
                color: source === key ? 'var(--ink)' : 'var(--mut)',
                boxShadow: source === key ? 'var(--shadow-card)' : 'none',
              }}
            >
              {label} <span style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", color: 'var(--faint)' }}>{count}</span>
            </button>
          ))}
        </div>

        {/* Messages */}
        <div>
          {comms.length === 0 && (
            <div style={{ ...cardBase, fontSize: 12.5, color: 'var(--mut)', fontStyle: 'italic' }}>
              No {source === 'all' ? '' : source === 'work' ? 'work ' : 'personal '}messages in view.
            </div>
          )}
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
              <div
                style={{ padding: '10px 12px', cursor: 'pointer' }}
                onClick={() => handleExpandComm(comm.id)}
              >
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
                  <span style={{ fontSize: '11px', color: 'var(--faint)' }}>{expandedId === comm.id ? '▲' : '▼'}</span>
                </div>

                {/* Subject */}
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginTop: '4px' }}>{comm.subject}</div>

                {/* Preview or full body */}
                {expandedId === comm.id ? (
                  <div style={{
                    fontSize: '12.5px',
                    color: 'var(--ink2)',
                    marginTop: '8px',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                    maxHeight: '400px',
                    overflowY: 'auto',
                    borderTop: '1px solid var(--line2)',
                    paddingTop: '8px',
                  }}>
                    {loadingBody === comm.id ? 'Loading…' : (bodyCache[comm.id] || comm.preview)}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--mut)', marginTop: '2px' }}>{comm.preview}</div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }} onClick={(e) => e.stopPropagation()}>
                  <button
                    style={{
                      ...smallBtn,
                      ...(draftedId === comm.id
                        ? { background: 'var(--accentbg)', color: 'var(--accent)', borderColor: 'var(--accent)' }
                        : {}),
                    }}
                    onClick={() => handleDraftReply(comm.id)}
                  >
                    {draftedId === comm.id ? 'Drafting…' : 'Draft Reply'}
                  </button>
                  <button style={smallBtn} onClick={() => addTodoFromComm(comm.id)}>Add to-do</button>
                  <button style={smallBtn} onClick={() => snoozeComm(comm.id)}>Snooze</button>
                  <button
                    style={{ ...smallBtn, marginLeft: 'auto', color: 'var(--mut)' }}
                    title="Remove from inbox (stays in Outlook)"
                    onClick={() => dismissComm(comm.id)}
                  >
                    ✕ Dismiss
                  </button>
                </div>

                {/* Inline draft composer (when a ready draft exists for this email) */}
                {expandedId === comm.id && (() => {
                  const inlineDraft = drafts.find((d) => d.commId === comm.id && d.status === 'ready');
                  return inlineDraft ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <DraftComposer draft={inlineDraft} who={comm.who} commId={comm.id} />
                    </div>
                  ) : null;
                })()}
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
