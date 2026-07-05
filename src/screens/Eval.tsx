import React, { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const cardBase: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)', border: '1px solid var(--line)',
};

interface EvalEmail { id: string; from: string; subject: string; preview: string; label?: string }
interface EvalResult { n: number; accuracy: number; precision: number; recall: number; confusion: { tp: number; fp: number; tn: number; fn: number } }

const LABELS = [
  { key: 'act',      hotkey: '1', desc: 'Needs MY reply or action', color: 'var(--p1)' },
  { key: 'delegate', hotkey: '2', desc: 'Someone else should handle', color: 'var(--p2)' },
  { key: 'fyi',      hotkey: '3', desc: 'Worth knowing, no action', color: 'var(--blue)' },
  { key: 'archive',  hotkey: '4', desc: 'Noise / no value', color: 'var(--mut)' },
];

export default function Eval() {
  const [emails, setEmails] = useState<EvalEmail[]>([]);
  const [labeledCount, setLabeledCount] = useState(0);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EvalResult | null>(null);

  useEffect(() => {
    fetch(`${API}/api/eval/emails`).then((r) => r.json()).then((d) => {
      const unlabeled = (d.emails || []).filter((e: EvalEmail) => !e.label);
      setEmails(unlabeled);
      setLabeledCount(d.labeled || 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const current = emails[idx];

  async function label(key: string) {
    if (!current) return;
    setIdx((i) => i + 1);
    const res = await fetch(`${API}/api/eval/label`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...current, label: key }),
    }).then((r) => r.json()).catch(() => null);
    if (res?.total) setLabeledCount(res.total);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack keystrokes while the user is typing in an input/textarea (e.g. the AskBar).
      const t = e.target as HTMLElement | null;
      if (e.isComposing || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) return;
      const l = LABELS.find((x) => x.hotkey === e.key);
      if (l) label(l.key);
      if (e.key === 's') setIdx((i) => i + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function handleRun() {
    setRunning(true);
    try {
      const r = await fetch(`${API}/api/eval/run`, { method: 'POST' }).then((x) => x.json());
      if (!r.error) setResult(r);
    } finally { setRunning(false); }
  }

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, color: 'var(--mut)' }}>
          <strong style={{ color: 'var(--ink)' }}>{labeledCount}</strong> labeled · target 200 · keys <code>1–4</code> to label, <code>s</code> to skip
        </span>
        <button onClick={handleRun} disabled={running || labeledCount < 20}
          style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 12.5, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: labeledCount < 20 ? 0.5 : 1, fontFamily: 'inherit' }}>
          {running ? 'Measuring…' : 'Measure triage precision'}
        </button>
      </div>

      {result && (
        <div style={{ ...cardBase, padding: 16 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[['Precision', result.precision, result.precision >= 0.85], ['Recall', result.recall, result.recall >= 0.7], ['Accuracy', result.accuracy, result.accuracy >= 0.85]].map(([name, v, ok]) => (
              <div key={name as string}>
                <div style={{ fontSize: 10.5, color: 'var(--faint)', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}>{name as string}</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: ok ? 'oklch(0.55 0.16 150)' : 'var(--p2)' }}>{pct(v as number)}</div>
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: 'var(--mut)', alignSelf: 'flex-end', fontFamily: 'JetBrains Mono, monospace' }}>
              n={result.n} · tp {result.confusion.tp} / fp {result.confusion.fp} / tn {result.confusion.tn} / fn {result.confusion.fn}
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 8 }}>Actionable = act + delegate. Spec bar: precision ≥ 85%.</div>
        </div>
      )}

      {loading && <div style={{ color: 'var(--mut)', fontSize: 13 }}>Loading recent emails…</div>}
      {!loading && !current && (
        <div style={{ ...cardBase, padding: '36px 24px', textAlign: 'center', fontSize: 13.5, color: 'var(--mut)' }}>
          All fetched emails labeled — hit "Measure triage precision", or come back after more mail arrives.
        </div>
      )}

      {current && (
        <div style={{ ...cardBase, padding: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 8 }}>
            {idx + 1} of {emails.length} unlabeled
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>{current.subject}</div>
          <div style={{ fontSize: 12.5, color: 'var(--mut)', margin: '4px 0 10px' }}>from {current.from}</div>
          <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6, background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
            {current.preview}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {LABELS.map((l) => (
              <button key={l.key} onClick={() => label(l.key)}
                style={{ flex: 1, minWidth: 130, padding: '10px 8px', border: `1.5px solid ${l.color}`, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: l.color }}>{l.hotkey} · {l.key}</div>
                <div style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 2 }}>{l.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
