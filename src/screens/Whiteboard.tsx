import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Screen } from '../App';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Attachment {
  name: string;
  type: string;
  data: string; // base64 for binary, raw text for text files
  preview?: string; // for images
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  attachments?: Attachment[];
  ts: Date;
}

interface Props {
  setScreen?: (s: Screen) => void;
}

// Simple markdown renderer: bold, bullets, code, newlines
function MD({ text }: { text: string }) {
  const lines = text.split('\n');
  let inCode = false;
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      inCode = !inCode;
      return;
    }
    if (inCode) {
      elements.push(
        <div key={i} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, background: 'var(--bg)', padding: '2px 6px', borderRadius: 3 }}>
          {line}
        </div>
      );
      return;
    }
    if (line.startsWith('### ')) {
      elements.push(<div key={i} style={{ fontWeight: 700, fontSize: 14, marginTop: 10, marginBottom: 2 }}>{line.slice(4)}</div>);
    } else if (line.startsWith('## ')) {
      elements.push(<div key={i} style={{ fontWeight: 700, fontSize: 15, marginTop: 12, marginBottom: 3 }}>{line.slice(3)}</div>);
    } else if (line.startsWith('# ')) {
      elements.push(<div key={i} style={{ fontWeight: 700, fontSize: 17, marginTop: 14, marginBottom: 4 }}>{line.slice(2)}</div>);
    } else if (/^[-*•]\s/.test(line)) {
      const content = line.replace(/^[-*•]\s/, '');
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0 }}>•</span>
          <span>{renderInline(content)}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const [num, ...rest] = line.split('. ');
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
          <span style={{ color: 'var(--mut)', flexShrink: 0, minWidth: 16, textAlign: 'right' }}>{num}.</span>
          <span>{renderInline(rest.join('. '))}</span>
        </div>
      );
    } else if (line === '') {
      elements.push(<div key={i} style={{ height: 6 }} />);
    } else {
      elements.push(<div key={i}>{renderInline(line)}</div>);
    }
  });

  return <div style={{ lineHeight: 1.65, fontSize: 13.5 }}>{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>{p.slice(1, -1)}</code>;
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*') && p.endsWith('*')) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

function genId() { return `wb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// Module-level state — survives tab switches
let _savedMessages: Message[] = [];
let _savedSessionId: string = genId();

export default function Whiteboard({ setScreen: _setScreen }: Props) {
  const [messages, setMessagesRaw] = useState<Message[]>(_savedMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<{ tasks: number; journal: number } | null>(null);
  const [sessionId, setSessionId] = useState(_savedSessionId);

  function setMessages(updater: Message[] | ((prev: Message[]) => Message[])) {
    setMessagesRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      _savedMessages = next;
      return next;
    });
  }

  function startNewSession() {
    _savedMessages = [];
    _savedSessionId = genId();
    setMessagesRaw([]);
    setSessionId(_savedSessionId);
    setInput('');
    setPendingFiles([]);
  }

  // ── Saved sessions (Redis-backed; includes drafts pulled in via Adler's workshop_draft) ──
  interface StoredSession { id: string; title: string; startedAt: number; messages: { role: string; text: string }[] }
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionsList, setSessionsList] = useState<StoredSession[]>([]);

  async function toggleSessions() {
    if (!sessionsOpen) {
      try {
        const res = await fetch(`${API}/api/whiteboard/sessions`);
        const json = await res.json() as { sessions: StoredSession[] };
        setSessionsList(json.sessions || []);
      } catch { setSessionsList([]); }
    }
    setSessionsOpen((v) => !v);
  }

  function loadSession(sess: StoredSession) {
    const msgs: Message[] = sess.messages.map((m, i) => ({
      id: i + 1,
      role: m.role === 'user' ? 'user' as const : 'assistant' as const,
      text: m.text,
      ts: new Date(sess.startedAt),
    }));
    nextId.current = msgs.length + 1;
    _savedMessages = msgs;
    _savedSessionId = sess.id;
    setMessagesRaw(msgs);
    setSessionId(sess.id);
    setSessionsOpen(false);
  }
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }, [input]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const newAtts: Attachment[] = [];
    for (const file of Array.from(files)) {
      const isText = file.type.startsWith('text/') || file.name.endsWith('.csv') || file.name.endsWith('.md') || file.name.endsWith('.txt');
      if (isText) {
        const text = await file.text();
        newAtts.push({ name: file.name, type: file.type || 'text/plain', data: text });
      } else {
        const b64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.readAsDataURL(file);
        });
        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
        newAtts.push({ name: file.name, type: file.type, data: b64, preview });
      }
    }
    setPendingFiles((prev) => [...prev, ...newAtts]);
  }, []);

  async function send() {
    const text = input.trim();
    if ((!text && !pendingFiles.length) || loading) return;

    const userMsg: Message = {
      id: nextId.current++,
      role: 'user',
      text,
      attachments: pendingFiles.length ? [...pendingFiles] : undefined,
      ts: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setPendingFiles([]);
    setLoading(true);

    // Build history for API (all messages including new one)
    const history = [...messages, userMsg].map((m) => ({
      role: m.role as 'user' | 'assistant',
      text: m.text,
      attachments: m.attachments,
    }));

    try {
      const res = await fetch(`${API}/api/whiteboard/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, sessionId }),
      });
      const data = await res.json() as { text?: string; error?: string };
      setMessages((prev) => [...prev, {
        id: nextId.current++,
        role: 'assistant',
        text: data.text || data.error || 'No response',
        ts: new Date(),
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: nextId.current++,
        role: 'assistant',
        text: `Error: ${err instanceof Error ? err.message : 'Network error'}`,
        ts: new Date(),
      }]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  async function handleExtract() {
    if (!messages.length || extracting) return;
    setExtracting(true);
    try {
      const history = messages.map((m) => ({ role: m.role as 'user' | 'assistant', text: m.text }));
      const res = await fetch(`${API}/api/whiteboard/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history }),
      });
      const data = await res.json() as { tasks: number; journal: number };
      setExtractResult(data);
      setTimeout(() => setExtractResult(null), 4000);
    } finally {
      setExtracting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const SUGGESTED = [
    "What should I focus on today?",
    "Help me think through Series B prep",
    "Draft a follow-up to Agilent",
    "What's on my calendar this week?",
  ];

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 820, margin: '0 auto' }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, minHeight: 28 }}>
        <button
          onClick={startNewSession}
          style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 6,
            border: '1px solid var(--line)', background: 'var(--card)',
            color: 'var(--mut)', cursor: 'pointer', fontFamily: "'Schibsted Grotesk', sans-serif",
          }}
        >
          + New Session
        </button>
        <div style={{ position: 'relative' }}>
          <button
            onClick={toggleSessions}
            style={{
              fontSize: 11, padding: '4px 12px', borderRadius: 6,
              border: '1px solid var(--line)', background: 'var(--card)',
              color: 'var(--mut)', cursor: 'pointer', fontFamily: "'Schibsted Grotesk', sans-serif",
            }}
          >
            Sessions ▾
          </button>
          {sessionsOpen && (
            <div style={{
              position: 'absolute', top: 30, left: 0, zIndex: 40, width: 320,
              background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 320, overflowY: 'auto', padding: 4,
            }}>
              {sessionsList.length === 0 && (
                <div style={{ padding: 10, fontSize: 12, color: 'var(--faint)' }}>No saved sessions yet</div>
              )}
              {sessionsList.map((sess) => (
                <div
                  key={sess.id}
                  onClick={() => loadSession(sess)}
                  style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, color: 'var(--ink2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sess.title}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--faint)' }}>{new Date(sess.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {sess.messages.length} messages</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          {extractResult && (
            <span style={{ fontSize: 11, color: 'var(--accent)' }}>
              {extractResult.tasks} task{extractResult.tasks !== 1 ? 's' : ''} + {extractResult.journal} journal entr{extractResult.journal !== 1 ? 'ies' : 'y'} added
            </span>
          )}
          {messages.length > 0 && (
            <button
              onClick={handleExtract}
              disabled={extracting}
              style={{
                fontSize: 11, padding: '4px 12px', borderRadius: 6,
                border: '1px solid var(--line)', background: 'var(--card)',
                color: 'var(--ink2)', cursor: extracting ? 'default' : 'pointer',
                opacity: extracting ? 0.6 : 1, fontFamily: "'Schibsted Grotesk', sans-serif",
              }}
            >
              {extracting ? 'Extracting…' : '⬆ Save to Atlas'}
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {messages.length === 0 && !loading && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, paddingBottom: 80 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--violet)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'white', fontWeight: 700 }}>A</div>
          <div style={{ fontSize: 21, fontWeight: 600, color: 'var(--ink)', fontFamily: 'Newsreader, serif' }}>Whiteboard</div>
          <div style={{ fontSize: 13, color: 'var(--mut)', textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>
            Think out loud with Adler. Brainstorm, workshop drafts, plan strategy — or drop in a document to analyze.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {SUGGESTED.map((p) => (
              <button key={p} onClick={() => { setInput(p); textareaRef.current?.focus(); }}
                style={{ padding: '6px 14px', border: '1px solid var(--line)', borderRadius: 20, background: 'var(--card)', color: 'var(--ink2)', fontSize: 12, cursor: 'pointer', fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                {p}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>You can also drag & drop files or paste images</div>
        </div>
      )}

      {/* Messages */}
      {(messages.length > 0 || loading) && (
        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 4, paddingBottom: 16 }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 10, marginBottom: 22, alignItems: 'flex-start' }}>
              {/* Avatar */}
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: msg.role === 'user' ? 'var(--ink)' : 'var(--violet)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, color: 'white', fontWeight: 700 }}>
                {msg.role === 'user' ? 'J' : 'A'}
              </div>

              <div style={{ maxWidth: '78%', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 4, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{msg.role === 'user' ? 'You' : 'Adler'}</span>
                  <span style={{ fontSize: 10, color: 'var(--faint)', fontFamily: "'JetBrains Mono', monospace" }}>{fmtTime(msg.ts)}</span>
                </div>

                {/* Attachments */}
                {msg.attachments?.map((att, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    {att.preview ? (
                      <img src={att.preview} alt={att.name} style={{ maxWidth: 280, maxHeight: 200, borderRadius: 8, display: 'block' }} />
                    ) : (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, color: 'var(--ink2)' }}>
                        📎 {att.name}
                      </div>
                    )}
                  </div>
                ))}

                {/* Bubble */}
                {msg.text && (
                  <div style={{
                    background: msg.role === 'user' ? 'var(--ink)' : 'var(--card)',
                    color: msg.role === 'user' ? 'white' : 'var(--ink)',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    padding: '10px 14px',
                    border: msg.role === 'assistant' ? '1px solid var(--line)' : 'none',
                    boxShadow: msg.role === 'assistant' ? 'var(--shadow-card)' : 'none',
                  }}>
                    {msg.role === 'assistant' ? <MD text={msg.text} /> : msg.text}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--violet)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'white', fontWeight: 700, flexShrink: 0 }}>A</div>
              <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '16px 16px 16px 4px', padding: '12px 16px', display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--mut)', animation: `wb-bounce 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {pendingFiles.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 6px', background: 'var(--accentbg)', border: '1px solid var(--accent)', borderRadius: 6, fontSize: 12 }}>
              {f.preview ? <img src={f.preview} style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 3 }} /> : <span>📎</span>}
              <span style={{ color: 'var(--ink2)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <button onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--mut)', padding: 0, lineHeight: 1 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ borderTop: messages.length > 0 ? '1px solid var(--line2)' : 'none', paddingTop: messages.length > 0 ? 14 : 0, paddingBottom: 2 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '8px 8px 8px 14px', boxShadow: 'var(--shadow-card)' }}>
          {/* Attach button */}
          <button onClick={() => fileInputRef.current?.click()} title="Attach file"
            style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--line)', background: 'transparent', cursor: 'pointer', color: 'var(--mut)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
            +
          </button>
          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.md,.csv" style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Adler… (Enter to send, Shift+Enter for newline)"
            rows={1}
            style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: 'var(--ink)', fontFamily: "'Schibsted Grotesk', sans-serif", lineHeight: 1.5, overflow: 'hidden' }}
          />

          <button onClick={send} disabled={(!input.trim() && !pendingFiles.length) || loading}
            style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: (input.trim() || pendingFiles.length) && !loading ? 'var(--ink)' : 'var(--line)', color: 'white', cursor: (input.trim() || pendingFiles.length) && !loading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15, transition: 'background 0.15s' }}>
            ↑
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--faint)', textAlign: 'center', marginTop: 5, fontFamily: "'JetBrains Mono', monospace" }}>
          Enter · Shift+Enter for newline · Drop files or click +
        </div>
      </div>

      <style>{`
        @keyframes wb-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
