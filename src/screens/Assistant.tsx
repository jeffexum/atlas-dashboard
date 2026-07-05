import React, { useState, useRef, useEffect } from 'react';
import type { Screen } from '../App';
import { askAgent, useStore } from '../store/useStore';

type ActionKind = 'nav' | 'action' | 'dismiss';

interface Action {
  label: string;
  kind: ActionKind;
  target?: Screen;
}

interface Message {
  id: number;
  role: 'user' | 'agent';
  text: string;
  actions?: Action[];
  agentName?: string;
  agentKey?: string;
}

const AGENT_COLORS: Record<string, string> = {
  planner: 'var(--blue)',
  coach: 'var(--accent)',
  keeper: 'oklch(0.76 0.15 75)',
  scout: 'conic-gradient(from 180deg, var(--accent), var(--blue), var(--violet), var(--accent))',
};

interface Props {
  setScreen: (s: Screen) => void;
}

const SEED: Message[] = [];

function actionStyle(kind: ActionKind): React.CSSProperties {
  if (kind === 'nav') {
    return { background: 'var(--accentbg)', border: '1px solid oklch(0.85 0.06 162)', color: 'var(--ink)' };
  }
  if (kind === 'action') {
    return { background: 'var(--accent)', border: 'none', color: 'white' };
  }
  return { background: 'transparent', border: '1px solid var(--line)', color: 'var(--mut)' };
}

export default function Assistant({ setScreen }: Props) {
  const assistantName = useStore((s) => s.assistantName);
  const [messages, setMessages] = useState<Message[]>(SEED);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(SEED.length + 1);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: nextId.current++, role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await askAgent(text);
      const agentName = result.agent
        ? result.agent.charAt(0).toUpperCase() + result.agent.slice(1)
        : assistantName;
      const agentMsg: Message = {
        id: nextId.current++,
        role: 'agent',
        text: result.text,
        agentName,
        agentKey: result.agent,
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch {
      const agentMsg: Message = {
        id: nextId.current++,
        role: 'agent',
        text: "I couldn't reach the server just now — please try again in a moment.",
        agentName: assistantName,
        agentKey: 'scout',
      };
      setMessages((prev) => [...prev, agentMsg]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') send();
  }

  function handleAction(action: Action) {
    if (action.kind === 'nav' && action.target) {
      setScreen(action.target);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <div
                  style={{
                    background: 'var(--ink)',
                    color: 'white',
                    borderRadius: '4px 4px 0 4px',
                    padding: '8px 12px',
                    maxWidth: '70%',
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {msg.text}
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div
                  style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: AGENT_COLORS[msg.agentKey || 'scout'] || AGENT_COLORS.scout,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{msg.agentName || assistantName}</span>
                <span
                  style={{
                    fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                    color: 'var(--accent)', background: 'var(--accentbg)',
                    padding: '1px 5px', borderRadius: 2, marginLeft: 2,
                  }}
                >
                  ready
                </span>
              </div>

              <div
                style={{
                  background: 'var(--card)',
                  borderRadius: '4px 4px 4px 0',
                  boxShadow: 'var(--shadow-card)',
                  border: '1px solid var(--line)',
                  padding: '10px 14px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  maxWidth: '80%',
                  color: 'var(--ink)',
                }}
              >
                {msg.text}
              </div>

              {msg.actions && msg.actions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {msg.actions.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleAction(action)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 3,
                        fontSize: 11.5,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        ...actionStyle(action.kind),
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {isLoading && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div
                style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: 'conic-gradient(from 180deg, var(--accent), var(--blue), var(--violet), var(--accent))',
                  flexShrink: 0,
                  animation: 'spin 1s linear infinite',
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Atlas</span>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
            <div
              style={{
                background: 'var(--card)',
                borderRadius: '4px 4px 4px 0',
                boxShadow: 'var(--shadow-card)',
                border: '1px solid var(--line)',
                padding: '10px 14px',
                fontSize: 13,
                color: 'var(--mut)',
                maxWidth: '80%',
              }}
            >
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid var(--line)',
          padding: '12px 16px',
          background: 'white',
          display: 'flex',
          gap: 8,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask ${assistantName} anything...`}
          style={{
            flex: 1,
            border: '1px solid var(--line)',
            borderRadius: 3,
            padding: '8px 12px',
            fontSize: 13,
            outline: 'none',
            fontFamily: 'inherit',
            color: 'var(--ink)',
            background: 'white',
          }}
        />
        <button
          onClick={send}
          style={{
            padding: '8px 14px',
            background: 'var(--accent)',
            color: 'white',
            borderRadius: 3,
            fontSize: 13,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
