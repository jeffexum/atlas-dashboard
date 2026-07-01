import { type Screen } from '../App';
import { useStore } from '../store/useStore';
import AskBar from './AskBar';
import Home from '../screens/Home';
import Inbox from '../screens/Inbox';
import Calendar from '../screens/Calendar';
import Todos from '../screens/Todos';
import Goals from '../screens/Goals';
import Habits from '../screens/Habits';
import Health from '../screens/Health';
import Finances from '../screens/Finances';
import Reading from '../screens/Reading';
import IdeasJournal from '../screens/IdeasJournal';
import Assistant from '../screens/Assistant';

interface NavItem {
  id: Screen;
  label: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    group: 'Today',
    items: [
      { id: 'home', label: 'Dashboard' },
      { id: 'inbox', label: 'Inbox' },
    ],
  },
  {
    group: 'Plan',
    items: [
      { id: 'calendar', label: 'Calendar' },
      { id: 'todos', label: 'To-dos' },
      { id: 'goals', label: 'Goals' },
    ],
  },
  {
    group: 'Track',
    items: [
      { id: 'habits', label: 'Habits' },
      { id: 'health', label: 'Health' },
      { id: 'finances', label: 'Finances' },
    ],
  },
  {
    group: 'Think',
    items: [
      { id: 'ideas', label: 'Ideas & Journal' },
      { id: 'reading', label: 'Reading' },
    ],
  },
];

interface Props {
  screen: Screen;
  setScreen: (s: Screen) => void;
}

export default function Shell({ screen, setScreen }: Props) {
  const comms = useStore((s) => s.comms);
  const tasks = useStore((s) => s.tasks);

  const openComms = comms.filter((c) => c.status === 'open').length;
  const urgentComms = comms.filter((c) => c.priority === 'p1' && c.status === 'open').length;
  const todayTaskCount = tasks.filter((t) => t.column === 'today').length;

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });

  const PAGE_TITLES: Record<Screen, { title: string; sub: string }> = {
    home: { title: `${greeting}, Jeff`, sub: dateStr },
    inbox: { title: 'Inbox', sub: `${openComms} messages · ${urgentComms} urgent` },
    calendar: { title: 'Calendar', sub: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) },
    todos: { title: 'To-dos', sub: `${todayTaskCount} tasks today` },
    goals: { title: 'Goals', sub: '4 active goals' },
    habits: { title: 'Habits', sub: '5 tracked habits' },
    health: { title: 'Health', sub: "Today's overview" },
    finances: { title: 'Finances', sub: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) },
    reading: { title: 'Reading', sub: '2 in progress' },
    ideas: { title: 'Ideas & Journal', sub: 'Your thinking space' },
    assistant: { title: 'Scout', sub: 'AI assistant · ready' },
  };

  const page = PAGE_TITLES[screen];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Nav Rail */}
      <nav
        style={{
          width: 190,
          minWidth: 190,
          background: 'var(--card)',
          borderRight: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 0 16px',
          overflowY: 'auto',
        }}
      >
        {/* Brand */}
        <div style={{ padding: '0 16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 27,
              height: 27,
              borderRadius: 6,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="4" stroke="white" strokeWidth="1.5"/>
              <line x1="7.5" y1="1" x2="7.5" y2="4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="7.5" y1="11" x2="7.5" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="1" y1="7.5" x2="4" y2="7.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="11" y1="7.5" x2="14" y2="7.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, letterSpacing: '-0.01em' }}>Atlas</div>
            <div style={{ fontSize: 10, color: 'var(--mut)', lineHeight: 1.2 }}>your life, organized</div>
          </div>
        </div>

        {/* Nav Groups */}
        {NAV.map((group) => (
          <div key={group.group} style={{ marginBottom: 4 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                textTransform: 'uppercase',
                letterSpacing: '.13em',
                color: 'var(--faint)',
                padding: '10px 16px 4px',
                fontWeight: 400,
              }}
            >
              {group.group}
            </div>
            {group.items.map((item) => {
              const active = screen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setScreen(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '5px 16px',
                    textAlign: 'left',
                    fontSize: 13.5,
                    fontWeight: active ? 600 : 400,
                    color: active ? 'var(--ink)' : 'var(--ink2)',
                    background: active ? 'var(--accentbg)' : 'transparent',
                    borderRadius: 0,
                    transition: 'background 0.1s',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: active ? 'var(--accent)' : 'var(--line)',
                      flexShrink: 0,
                      transition: 'background 0.1s',
                    }}
                  />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}

        {/* Scout nav item at bottom */}
        <div style={{ marginTop: 'auto', padding: '12px 16px 0' }}>
          <button
            onClick={() => setScreen('assistant')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '6px 0',
              textAlign: 'left',
              fontSize: 13,
              fontWeight: screen === 'assistant' ? 600 : 400,
              color: screen === 'assistant' ? 'var(--ink)' : 'var(--mut)',
              background: 'transparent',
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'conic-gradient(from 0deg, oklch(0.55 0.13 162), oklch(0.58 0.12 245), oklch(0.5 0.09 262), oklch(0.55 0.07 255), oklch(0.55 0.13 162))',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--card)' }} />
            </span>
            Scout
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 9,
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--accent)',
                background: 'var(--accentbg)',
                padding: '1px 5px',
                borderRadius: 2,
              }}
            >
              ready
            </span>
          </button>
        </div>
      </nav>

      {/* Main Column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* TopBar */}
        <div
          style={{
            height: 56,
            minHeight: 56,
            background: 'var(--card)',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Newsreader', Georgia, serif",
                fontSize: 23,
                fontWeight: 400,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
              }}
            >
              {page.title}
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: 'var(--faint)',
                marginTop: 1,
              }}
            >
              {page.sub}
            </div>
          </div>

          {/* Agent pill */}
          <button
            onClick={() => setScreen('assistant')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 12px',
              background: 'var(--accentbg)',
              border: '1px solid oklch(0.85 0.06 162)',
              borderRadius: 20,
              fontSize: 12.5,
              fontWeight: 500,
              color: 'var(--ink)',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--accent)',
                boxShadow: '0 0 0 2px oklch(0.85 0.06 162)',
              }}
            />
            Scout
            <span style={{ color: 'var(--mut)', fontWeight: 400 }}>·</span>
            <span style={{ color: 'var(--accent)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>ready</span>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {screen === 'home' && <Home setScreen={setScreen} />}
          {screen === 'inbox' && <Inbox setScreen={setScreen} />}
          {screen === 'calendar' && <Calendar />}
          {screen === 'todos' && <Todos setScreen={setScreen} />}
          {screen === 'goals' && <Goals setScreen={setScreen} />}
          {screen === 'habits' && <Habits setScreen={setScreen} />}
          {screen === 'health' && <Health />}
          {screen === 'finances' && <Finances />}
          {screen === 'reading' && <Reading setScreen={setScreen} />}
          {screen === 'ideas' && <IdeasJournal setScreen={setScreen} />}
          {screen === 'assistant' && <Assistant setScreen={setScreen} />}
        </div>

        {/* AskBar */}
        <AskBar setScreen={setScreen} />
      </div>
    </div>
  );
}
