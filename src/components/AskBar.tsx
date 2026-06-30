import { useState } from 'react';
import { useStore, askAgent } from '../store/useStore';
import type { Screen } from '../App';

const CHIPS = ['Plan my day', 'Add a to-do', 'How am I doing?', 'Journal this'];

interface Props {
  setScreen: (s: Screen) => void;
}

export default function AskBar({ setScreen }: Props) {
  const [value, setValue] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(text: string) {
    const t = text.trim().toLowerCase();
    if (!t) return;

    // Navigation fast-path commands
    if (t === 'inbox' || t === 'go to inbox') { setScreen('inbox'); setValue(''); return; }
    if (t === 'calendar' || t === 'go to calendar') { setScreen('calendar'); setValue(''); return; }
    if (t === 'habits' || t === 'go to habits') { setScreen('habits'); setValue(''); return; }
    if (t === 'goals' || t === 'go to goals') { setScreen('goals'); setValue(''); return; }
    if (t === 'health' || t === 'go to health') { setScreen('health'); setValue(''); return; }
    if (t === 'reading' || t === 'go to reading') { setScreen('reading'); setValue(''); return; }
    if (t === 'assistant' || t === 'scout') { setScreen('assistant'); setValue(''); return; }

    // Quick local add-task fast-path
    if (t.startsWith('add') && (t.includes('task') || t.includes('to-do') || t.includes('todo'))) {
      const raw = text.trim();
      const title = raw.replace(/^add\s+(a\s+)?(task|to-do|todo)[:\s]*/i, '').trim() || 'New task';
      useStore.getState().addTask({
        id: Date.now().toString(),
        title,
        category: 'Personal',
        priority: 'p3',
        done: false,
        column: 'today',
      });
      setScreen('todos');
      setValue('');
      return;
    }

    // AI agent call for everything else
    setValue('');
    setIsLoading(true);
    try {
      const result = await askAgent(text);
      const agentName = result.agent
        ? result.agent.charAt(0).toUpperCase() + result.agent.slice(1)
        : 'Atlas';
      setResponse(`${agentName}: ${result.text}`);
      setTimeout(() => setResponse(''), 4000);
    } catch {
      setResponse('Got it!');
      setTimeout(() => setResponse(''), 2000);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      style={{
        background: 'var(--card)',
        borderTop: '1px solid var(--line)',
        padding: '10px 16px 12px',
      }}
    >
      {/* Response message */}
      {response && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--accent)',
            fontWeight: 500,
            marginBottom: 6,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {response}
        </div>
      )}

      {/* Quick-action chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {CHIPS.map((chip) => (
          <button
            key={chip}
            style={{
              padding: '3px 9px',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--ink2)',
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-chip)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background 0.1s, border-color 0.1s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--accentbg)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'oklch(0.8 0.07 162)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line)';
            }}
            onClick={() => handleSubmit(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Agent orb */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background:
              'conic-gradient(from 0deg, oklch(0.55 0.13 162) 0%, oklch(0.58 0.12 245) 30%, oklch(0.5 0.09 262) 50%, oklch(0.55 0.07 255) 70%, oklch(0.76 0.15 75) 85%, oklch(0.55 0.13 162) 100%)',
            flexShrink: 0,
            boxShadow: '0 0 0 2px var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: isLoading ? 'spin 1s linear infinite' : 'none',
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'var(--card)',
            }}
          />
        </div>
        {isLoading && (
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        )}

        {/* Text input */}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(value); }}
          placeholder="Ask Scout anything…"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            fontSize: 13.5,
            color: 'var(--ink)',
            background: 'transparent',
            lineHeight: 1.5,
          }}
        />

        {/* Mono hint */}
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: 'var(--faint)',
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: 2,
            padding: '1px 5px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
          onClick={() => handleSubmit(value)}
        >
          ↵
        </span>

        {/* Mic button */}
        <button
          style={{
            width: 31,
            height: 31,
            borderRadius: '50%',
            border: '1px solid var(--line)',
            background: 'var(--card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="4.5" y="1" width="5" height="8" rx="2.5" stroke="var(--mut)" strokeWidth="1.2"/>
            <path d="M2 7c0 2.76 2.24 5 5 5s5-2.24 5-5" stroke="var(--mut)" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="7" y1="12" x2="7" y2="13.5" stroke="var(--mut)" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
