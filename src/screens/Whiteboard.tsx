import React, { useState, useRef, useEffect } from 'react';
import { askAgent } from '../store/useStore';
import type { Screen } from '../App';

interface Message {
  id: number;
  role: 'user' | 'agent';
  text: string;
  agentName?: string;
  agentKey?: string;
  ts: Date;
}

const AGENT_COLORS: Record<string, string> = {
  planner: 'var(--blue)',
  coach: 'var(--accent)',
  keeper: 'oklch(0.76 0.15 75)',
  scout: 'var(--violet)',
  adler: 'var(--violet)',
};

function AgentDot({ agentKey }: { agentKey?: string }) {
  const color = AGENT_COLORS[agentKey || 'scout'] || 'var(--violet)';
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      fontSize: 13, color: 'white', fontWeight: 700,
    }}>
      {(agentKey || 'S')[0].toUpperCase()}
    </div>
  );
}

// Very simple markdown-ish renderer: bold, newlines, bullet lists
function RenderText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div style={{ lineHeight: 1.65 }}>
      {lines.map((line, i) => {
        const isBullet = /^[-*•]\s/.test(line);
        const content = line.replace(/^[-*•]\s/, '');
        // Bold: **text**
        const parts = content.split(/(\*\*[^*]+\*\*)/g).map((p, j) => {
          if (p.startsWith('**') && p.endsWith('**')) {
            return <strong key={j}>{p.slice(2, -2)}</strong>;
          }
          return p;
        });
        if (isBullet) {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
              <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{parts}</span>
            </div>
          );
        }
        return (
          <div key={i} style={{ marginBottom: line === '' ? 6 : 0 }}>
            {parts}
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  setScreen?: (s: Screen) => void;
}

export default function Whiteboard({ setScreen: _setScreen }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: nextId.current++, role: 'user', text, ts: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const raw = await res.text();
      let result: { text: string; agent: string };
      try {
        result = JSON.parse(raw);
      } catch {
        result = { text: `Server error (${res.status}): ${raw.slice(0, 200)}`, agent: 'adler' };
      }
      const agentName = result.agent
        ? result.agent.charAt(0).toUpperCase() + result.agent.slice(1)
        : 'Adler';
      setMessages((prev) => [...prev, {
        id: nextId.current++,
        role: 'agent',
        text: result.text,
        agentName,
        agentKey: result.agent,
        ts: new Date(),
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: nextId.current++,
        role: 'agent',
        text: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        agentName: 'Adler',
        agentKey: 'adler',
        ts: new Date(),
      }]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      maxWidth: 780,
      margin: '0 auto',
    }}>
      {/* Empty state */}
      {messages.length === 0 && !loading && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          paddingBottom: 80,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--violet)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, color: 'white', fontWeight: 700,
          }}>A</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)', fontFamily: 'Newsreader, serif' }}>
            Whiteboard
          </div>
          <div style={{ fontSize: 13, color: 'var(--mut)', textAlign: 'center', maxWidth: 360 }}>
            Think out loud with your agents. Ask anything, brainstorm, plan, or just talk through what's on your mind.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              "What should I focus on today?",
              "Help me think through Series B prep",
              "Summarize my open tasks",
              "What's on my calendar this week?",
            ].map((prompt) => (
              <button
                key={prompt}
                onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--line)',
                  borderRadius: 20,
                  background: 'var(--card)',
                  color: 'var(--ink2)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: "'Schibsted Grotesk', sans-serif",
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8, paddingBottom: 16 }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{
              display: 'flex',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              gap: 10,
              marginBottom: 20,
              alignItems: 'flex-start',
            }}>
              {/* Avatar */}
              {msg.role === 'user' ? (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--ink)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 12, color: 'white', fontWeight: 700,
                }}>J</div>
              ) : (
                <AgentDot agentKey={msg.agentKey} />
              )}

              <div style={{ maxWidth: '75%', minWidth: 0 }}>
                {/* Name + time */}
                <div style={{
                  display: 'flex',
                  gap: 6,
                  alignItems: 'baseline',
                  marginBottom: 4,
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                    {msg.role === 'user' ? 'You' : (msg.agentName || 'Adler')}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--faint)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtTime(msg.ts)}
                  </span>
                </div>

                {/* Bubble */}
                <div style={{
                  background: msg.role === 'user' ? 'var(--ink)' : 'var(--card)',
                  color: msg.role === 'user' ? 'white' : 'var(--ink)',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '10px 14px',
                  fontSize: 13.5,
                  border: msg.role === 'agent' ? '1px solid var(--line)' : 'none',
                  boxShadow: msg.role === 'agent' ? 'var(--shadow-card)' : 'none',
                }}>
                  {msg.role === 'agent' ? <RenderText text={msg.text} /> : msg.text}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20 }}>
              <AgentDot agentKey="adler" />
              <div style={{
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: '16px 16px 16px 4px',
                padding: '12px 16px',
                display: 'flex', gap: 4, alignItems: 'center',
              }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--mut)',
                    animation: `bounce 1.2s ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input area */}
      <div style={{
        borderTop: messages.length > 0 ? '1px solid var(--line2)' : 'none',
        paddingTop: messages.length > 0 ? 16 : 0,
        paddingBottom: 4,
      }}>
        <div style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          background: 'var(--card)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: '10px 12px',
          boxShadow: 'var(--shadow-card)',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Adler… (Enter to send, Shift+Enter for newline)"
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13.5,
              color: 'var(--ink)',
              fontFamily: "'Schibsted Grotesk', sans-serif",
              lineHeight: 1.5,
              overflow: 'hidden',
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            style={{
              width: 32, height: 32,
              borderRadius: '50%',
              border: 'none',
              background: input.trim() && !loading ? 'var(--ink)' : 'var(--line)',
              color: 'white',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              fontSize: 14,
              transition: 'background 0.15s',
            }}
          >
            ↑
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--faint)', textAlign: 'center', marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>
          Enter to send · Shift+Enter for newline
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
