import React, { useEffect, useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const cardBase: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--line)',
};

interface SetupStatus {
  user: string; assistant: string; timezone: string;
  outlook: boolean; googleCalendar: boolean; gmail: boolean; oura: boolean;
  telegram: boolean; apiSecured: boolean; styleProfile: boolean; knowledgeDocs: number;
}

interface KnowledgeItem { id: string; name: string; addedAt: number; size: number; distilled: boolean }
interface CostSummary { todayUsd: number; alert: boolean; days: { date: string; usd: number; calls: number }[]; byPurposeToday: { purpose: string; usd: number; calls: number }[] }
interface AuditRow { ts: number; actor: string; action: string; objectRef?: string; detail?: string }

function Dot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: ok ? 'var(--accent)' : 'var(--line)', flexShrink: 0,
    }} />
  );
}

function Row({ ok, title, detail, action }: { ok: boolean; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line2)' }}>
      <Dot ok={ok} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.5 }}>{detail}</div>
      </div>
      {action}
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
  border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink2)',
  cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap',
};
const btnPrimary: React.CSSProperties = { ...btn, background: 'var(--accent)', color: '#fff', border: 'none' };

export default function Setup() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [docs, setDocs] = useState<KnowledgeItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [learning, setLearning] = useState(false);
  const [botHelp, setBotHelp] = useState(false);
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const [st, kn, co, au] = await Promise.all([
        fetch(`${API}/api/setup/status`).then((r) => r.json()),
        fetch(`${API}/api/knowledge`).then((r) => r.json()),
        fetch(`${API}/api/admin/costs`).then((r) => r.json()).catch(() => null),
        fetch(`${API}/api/admin/audit?limit=25`).then((r) => r.json()).catch(() => []),
      ]);
      setStatus(st); setDocs(kn); setCosts(co); setAuditRows(Array.isArray(au) ? au : []);
    } catch { /* server unreachable */ }
  }
  useEffect(() => { refresh(); }, []);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const content = await file.text();
        await fetch(`${API}/api/knowledge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name.replace(/\.(md|txt)$/i, ''), content }),
        });
      }
      await refresh();
    } finally { setUploading(false); }
  }

  async function handleLearn() {
    setLearning(true);
    try { await fetch(`${API}/api/outlook/learn`, { method: 'POST' }); await refresh(); }
    finally { setLearning(false); }
  }

  if (!status) return <div style={{ padding: 24, color: 'var(--mut)', fontSize: 13 }}>Loading setup status…</div>;

  const a = status.assistant;

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.6 }}>
        Set up <strong style={{ color: 'var(--ink)' }}>{status.user}</strong>'s Atlas — connect accounts, train {a}, and upload
        anything {a} should know. Each row goes green when done.
      </div>

      {/* Connections */}
      <div style={{ ...cardBase, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--faint)', borderBottom: '1px solid var(--line2)' }}>1 · Connect accounts</div>
        <Row ok={status.outlook} title="Outlook (work email + calendar)"
          detail="Email sync, in-thread replies, and work calendar."
          action={<a href={`${API}/api/outlook/auth`} style={btn}>{status.outlook ? 'Re-connect' : 'Connect'}</a>} />
        <Row ok={status.googleCalendar} title="Google Calendar (personal)"
          detail="Personal calendar in the side-by-side view."
          action={<a href={`${API}/api/google/auth`} style={btn}>{status.googleCalendar ? 'Re-connect' : 'Connect'}</a>} />
        <Row ok={status.gmail} title="Gmail (personal email)"
          detail={status.googleCalendar && !status.gmail ? 'Google is connected without mail access — re-connect to grant it.' : 'Personal inbox sync and in-thread replies.'}
          action={<a href={`${API}/api/google/auth`} style={btn}>{status.gmail ? 'Re-connect' : 'Connect'}</a>} />
        <Row ok={status.oura} title="Oura Ring"
          detail={status.oura ? 'Sleep, readiness, and activity sync every 2 hours.' : 'Create a token at cloud.ouraring.com/personal-access-tokens, then add OURA_TOKEN to the server environment.'} />
        <Row ok={status.telegram} title={`Telegram bot (${a} on your phone)`}
          detail={status.telegram ? 'Bot is configured — message it to claim ownership.' : 'Create a bot and add its token to the server environment.'}
          action={<button style={btn} onClick={() => setBotHelp((v) => !v)}>{botHelp ? 'Hide guide' : 'How?'}</button>} />
        {botHelp && (
          <div style={{ padding: '12px 16px 16px 38px', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.8, background: 'var(--bg)' }}>
            1. In Telegram, message <strong>@BotFather</strong> → send <code>/newbot</code><br />
            2. Pick a name and username — BotFather replies with a token like <code>123456:ABC-DEF…</code><br />
            3. Add it to the API server's environment as <code>TELEGRAM_BOT_TOKEN</code> and redeploy<br />
            4. Message your new bot anything — the first person to message it becomes the owner<br />
            5. Approve family with <code>/approve &lt;chatId&gt; &lt;name&gt;</code>
          </div>
        )}
        <Row ok={status.apiSecured} title="API lock"
          detail={status.apiSecured ? 'All API routes require the instance secret.' : 'Set ATLAS_SECRET (server) and VITE_ATLAS_SECRET (dashboard) to lock this instance down.'} />
      </div>

      {/* Training */}
      <div style={{ ...cardBase, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--faint)', borderBottom: '1px solid var(--line2)' }}>2 · Train {a}</div>
        <Row ok={status.styleProfile} title="Email & management style"
          detail={`${a} studies your sent email to draft replies in your voice.`}
          action={<button style={btnPrimary} disabled={learning || !status.outlook} onClick={handleLearn}>{learning ? 'Learning…' : status.styleProfile ? 'Re-learn' : 'Learn my style'}</button>} />
        <Row ok={status.knowledgeDocs > 0} title="Knowledge documents"
          detail={`Upload markdown/text exports (e.g. from ChatGPT) — ${a} distills each into memory and can read the full text on demand.`}
          action={
            <>
              <input ref={fileRef} type="file" accept=".md,.txt,.markdown" multiple style={{ display: 'none' }}
                onChange={(e) => handleFiles(e.target.files)} />
              <button style={btnPrimary} disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? 'Uploading…' : 'Upload .md files'}
              </button>
            </>
          } />
        {docs.length > 0 && (
          <div style={{ padding: '8px 16px 12px 38px' }}>
            {docs.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12.5, color: 'var(--ink2)' }}>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📄 {d.name}</span>
                <span style={{ fontSize: 10.5, color: 'var(--faint)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {(d.size / 1000).toFixed(0)}k chars{d.distilled ? ' · distilled ✓' : ''}
                </span>
                <span style={{ cursor: 'pointer', color: 'var(--faint)' }} title="Remove"
                  onClick={async () => { await fetch(`${API}/api/knowledge/${d.id}`, { method: 'DELETE' }); refresh(); }}>✕</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cost telemetry */}
      {costs && (
        <div style={{ ...cardBase, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--faint)', borderBottom: '1px solid var(--line2)' }}>3 · AI cost</div>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, fontWeight: 700, color: costs.alert ? 'var(--p1)' : 'var(--ink)' }}>
              ${costs.todayUsd.toFixed(2)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--mut)' }}>today{costs.alert ? ' — over the $3/day bar' : ''}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 11, color: 'var(--faint)', fontFamily: 'JetBrains Mono, monospace' }}>
              {costs.days.slice(0, 7).map((d) => <span key={d.date}>{d.date.slice(5)}: ${d.usd.toFixed(2)}</span>)}
            </span>
          </div>
          {costs.byPurposeToday.length > 0 && (
            <div style={{ padding: '0 16px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {costs.byPurposeToday.map((p) => (
                <span key={p.purpose} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--line2)', color: 'var(--mut)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {p.purpose} ${p.usd.toFixed(2)} ({p.calls})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audit log */}
      {auditRows.length > 0 && (
        <div style={{ ...cardBase, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--faint)', borderBottom: '1px solid var(--line2)' }}>4 · Recent agent activity</div>
          <div style={{ padding: '8px 16px 12px', maxHeight: 260, overflowY: 'auto' }}>
            {auditRows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 11.5, alignItems: 'baseline' }}>
                <span style={{ color: 'var(--faint)', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
                  {new Date(r.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
                <span style={{ color: r.actor === 'agent' ? 'var(--violet)' : 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>{r.actor}</span>
                <span style={{ color: 'var(--ink2)' }}>{r.action}</span>
                {r.detail && <span style={{ color: 'var(--faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--faint)', lineHeight: 1.6 }}>
        Instance: {status.user} · {a} · {status.timezone}. Personalize via USER_NAME, USER_BIO, USER_SIGNOFF, USER_TZ,
        ASSISTANT_NAME env vars on the API server.
      </div>
    </div>
  );
}
