// server/state.ts — in-memory mirror of the Zustand store shape

export interface Task {
  id: string;
  title: string;
  category: string;
  priority: 'p1' | 'p2' | 'p3';
  done: boolean;
  agentBadge?: string;
  column: 'today' | 'upcoming' | 'done';
}

export interface Comm {
  id: string;
  source: 'email' | 'teams';
  who: string;
  subject: string;
  preview: string;
  time: string;
  priority: 'p1' | 'p2' | 'p3';
  status: 'open' | 'snoozed';
}

export interface Draft {
  id: string;
  to: string;
  re: string;
  text: string;
  status: 'ready' | 'sent' | 'discarded';
}

export interface ProposedAction {
  id: string;
  kind: 'todo' | 'cal' | 'decline';
  icon: string;
  text: string;
  meta: string;
  priority?: 'p1' | 'p2' | 'p3';
  status: 'pending' | 'accepted' | 'dismissed';
}

export interface Habit {
  id: string;
  name: string;
  cadence: string;
  streak: number;
  rate: number;
  pct: number;
  completedToday: boolean;
  heatmap: boolean[];
}

export interface Goal {
  id: string;
  name: string;
  pct: number;
  current: string;
  target: string;
  deadline: string;
  deadlineShort: string;
  tasks: number;
  color: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  pct: number;
  chapter: string;
  status: 'reading' | 'queue';
  gradient: string;
}

export interface Highlight {
  id: string;
  quote: string;
  source: string;
}

export interface Idea {
  id: string;
  title: string;
  body: string;
  tags: string[];
  color: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  text: string;
}

export interface CalEvent {
  id: string;
  title: string;
  start: number;
  duration: number;
  color: string;
  category: string;
  date: number;
}

export interface AdlerMessage {
  role: 'user' | 'adler';
  content: string;
  ts: number;
}

export interface ServerState {
  tasks: Task[];
  comms: Comm[];
  drafts: Draft[];
  proposedActions: ProposedAction[];
  habits: Habit[];
  goals: Goal[];
  books: Book[];
  highlights: Highlight[];
  ideas: Idea[];
  journalEntries: JournalEntry[];
  calEvents: CalEvent[];
  calNote: string;
  adlerMemory: AdlerMessage[];
  adlerNotes: string;
  adlerLastContact: number;
  briefingText: string;
  briefingNudges: string[];
  briefingGeneratedAt: number;
}

function makeHeatmap(rate: number, name: string): boolean[] {
  return Array.from({ length: 25 }, (_, i) => {
    return (i * 7 + name.charCodeAt(0)) % 10 < rate / 10;
  });
}

const seedState: ServerState = {
  tasks: [
    { id: 't1', title: 'Email the accountant', category: 'Work', priority: 'p1', done: false, column: 'today' },
    { id: 't2', title: 'Review Q2 budget', category: 'Work', priority: 'p2', done: false, column: 'today' },
    { id: 't3', title: 'Book dentist follow-up', category: 'Health', priority: 'p1', done: false, agentBadge: 'From inbox', column: 'today' },
    { id: 't4', title: 'Finish presentation slides', category: 'Work', priority: 'p2', done: false, column: 'today' },
    { id: 't5', title: 'Call mom', category: 'Personal', priority: 'p3', done: false, column: 'upcoming' },
    { id: 't6', title: 'Renew gym membership', category: 'Health', priority: 'p3', done: false, column: 'upcoming' },
    { id: 't7', title: 'Draft blog post', category: 'Personal', priority: 'p3', done: false, column: 'upcoming' },
    { id: 't8', title: 'Submit expense report', category: 'Work', priority: 'p2', done: true, column: 'done' },
  ],
  comms: [
    { id: 'c1', source: 'email', who: 'Mark Johnson', subject: 'Re: Q2 budget review', preview: 'Need your sign-off by EOD', time: '8:15am', priority: 'p1', status: 'open' },
    { id: 'c2', source: 'teams', who: 'Sarah Chen', subject: 'Urgent: server issue in prod', preview: 'The API is throwing 500s', time: '7:52am', priority: 'p1', status: 'open' },
    { id: 'c3', source: 'email', who: 'Lisa Park', subject: 'Following up on proposal', preview: "Haven't heard back...", time: '9:30am', priority: 'p2', status: 'open' },
    { id: 'c4', source: 'email', who: 'David Kim', subject: 'Team lunch this Friday', preview: 'Can you make it?', time: '10:45am', priority: 'p2', status: 'open' },
    { id: 'c5', source: 'teams', who: 'Mike Torres', subject: 'Design review tomorrow', preview: 'Are we still on?', time: '11:20am', priority: 'p2', status: 'open' },
    { id: 'c6', source: 'email', who: 'Newsletter', subject: 'Your weekly digest', preview: 'Top stories this week...', time: '6:00am', priority: 'p3', status: 'open' },
    { id: 'c7', source: 'email', who: 'GitHub', subject: 'PR review requested', preview: 'alexchen opened a PR', time: '8:45am', priority: 'p3', status: 'open' },
    { id: 'c8', source: 'teams', who: 'Tom Wilson', subject: 'Coffee chat?', preview: 'Free sometime next week?', time: '2:30pm', priority: 'p3', status: 'open' },
  ],
  drafts: [
    {
      id: 'd1',
      to: 'Mark Johnson',
      re: 'Q2 Budget',
      text: "Hi Mark, I've reviewed the Q2 numbers. The variance in Q3 projections looks reasonable given the market conditions. I'll sign off — can you send the final doc for my records? Thanks, Jeff",
      status: 'ready',
    },
    {
      id: 'd2',
      to: 'Lisa Park',
      re: 'Proposal',
      text: "Hi Lisa, apologies for the delay. I'd love to move forward — can we schedule a 30-min call this week to align on scope? Alex",
      status: 'ready',
    },
    {
      id: 'd3',
      to: 'David Kim',
      re: 'Team Lunch',
      text: "Hey David, Friday works great! I'll be there. What time and where?",
      status: 'ready',
    },
  ],
  proposedActions: [
    { id: 'a1', kind: 'todo', icon: '✓', text: 'Add to-do: prepare Q2 talking points', meta: 'for 3pm meeting · P2', priority: 'p2', status: 'pending' },
    { id: 'a2', kind: 'cal', icon: '◷', text: 'Hold 90min focus block: finish slides', meta: 'Tomorrow 10–11:30am', status: 'pending' },
    { id: 'a3', kind: 'decline', icon: '✕', text: "Decline: 'All-hands sync' (conflicts with focus block)", meta: 'Wed 2pm', status: 'pending' },
    { id: 'a4', kind: 'todo', icon: '✓', text: 'Add to-do: follow up with Lisa by Thursday', meta: 'P2 · From email', priority: 'p2', status: 'pending' },
    { id: 'a5', kind: 'cal', icon: '◷', text: 'Add travel buffer: 30min before 3pm Q2 Review', meta: '2:30pm buffer', status: 'pending' },
  ],
  habits: [
    { id: 'h1', name: 'Morning run', cadence: 'Daily · 6am', streak: 12, rate: 80, pct: 0.6, completedToday: false, heatmap: makeHeatmap(80, 'Morning run') },
    { id: 'h2', name: 'Meditate 10 min', cadence: 'Daily · 7am', streak: 5, rate: 67, pct: 0.67, completedToday: false, heatmap: makeHeatmap(67, 'Meditate 10 min') },
    { id: 'h3', name: 'Read 30 min', cadence: 'Daily · 9pm', streak: 21, rate: 90, pct: 0.90, completedToday: false, heatmap: makeHeatmap(90, 'Read 30 min') },
    { id: 'h4', name: 'Workout', cadence: '3x/week', streak: 2, rate: 85, pct: 0.85, completedToday: false, heatmap: makeHeatmap(85, 'Workout') },
    { id: 'h5', name: 'No alcohol', cadence: 'Daily', streak: 8, rate: 73, pct: 0.73, completedToday: false, heatmap: makeHeatmap(73, 'No alcohol') },
  ],
  goals: [
    { id: 'g1', name: 'Run 500 miles', pct: 38, current: '190 mi', target: '500 mi', deadline: 'Dec 31, 2026', deadlineShort: "Dec '26", tasks: 2, color: 'var(--p1)' },
    { id: 'g2', name: 'Read 24 books', pct: 54, current: '13 books', target: '24 books', deadline: 'Dec 31, 2026', deadlineShort: "Dec '26", tasks: 1, color: 'var(--blue)' },
    { id: 'g3', name: 'Save $20,000', pct: 61, current: '$12,200', target: '$20,000', deadline: 'Dec 31, 2026', deadlineShort: "Dec '26", tasks: 3, color: 'var(--accent)' },
    { id: 'g4', name: 'Launch side project', pct: 25, current: '3 of 12 milestones', target: '12 milestones', deadline: 'Sep 30, 2026', deadlineShort: "Sep '26", tasks: 4, color: 'var(--violet)' },
  ],
  books: [
    { id: 'b1', title: 'The Creative Act', author: 'Rick Rubin', pct: 68, chapter: 'ch. 14 of 21', status: 'reading', gradient: 'repeating-linear-gradient(135deg, oklch(0.58 0.12 245) 0, oklch(0.58 0.12 245) 6px, oklch(0.7 0.08 245) 6px, oklch(0.7 0.08 245) 12px)' },
    { id: 'b2', title: 'Shape Up', author: 'Ryan Singer', pct: 34, chapter: 'ch. 6 of 18', status: 'reading', gradient: 'repeating-linear-gradient(135deg, oklch(0.55 0.13 162) 0, oklch(0.55 0.13 162) 6px, oklch(0.7 0.09 162) 6px, oklch(0.7 0.09 162) 12px)' },
    { id: 'b3', title: 'Thinking, Fast and Slow', author: 'Kahneman', pct: 0, chapter: '', status: 'queue', gradient: 'linear-gradient(135deg, oklch(0.6 0.1 27), oklch(0.7 0.08 27))' },
    { id: 'b4', title: 'A Pattern Language', author: 'Alexander', pct: 0, chapter: '', status: 'queue', gradient: 'linear-gradient(135deg, oklch(0.6 0.1 200), oklch(0.7 0.08 200))' },
    { id: 'b5', title: 'The Mom Test', author: 'Rob Fitzpatrick', pct: 0, chapter: '', status: 'queue', gradient: 'linear-gradient(135deg, oklch(0.6 0.1 75), oklch(0.7 0.08 75))' },
    { id: 'b6', title: 'Dune', author: 'Frank Herbert', pct: 0, chapter: '', status: 'queue', gradient: 'linear-gradient(135deg, oklch(0.6 0.1 50), oklch(0.7 0.08 50))' },
    { id: 'b7', title: 'Staff Engineer', author: 'Will Larson', pct: 0, chapter: '', status: 'queue', gradient: 'linear-gradient(135deg, oklch(0.6 0.1 280), oklch(0.7 0.08 280))' },
  ],
  highlights: [
    { id: 'hl1', quote: 'The work wants to be made, and it wants to be made through you.', source: 'The Creative Act, p. 47' },
    { id: 'hl2', quote: 'Creativity is not a talent. It is a way of operating.', source: 'The Creative Act, p. 83' },
    { id: 'hl3', quote: "You can't learn what people think of an idea just by asking them.", source: 'The Mom Test, p. 12' },
    { id: 'hl4', quote: 'Shaping is the key creative leap... done by a small group away from distractions.', source: 'Shape Up, p. 8' },
  ],
  ideas: [
    { id: 'i1', title: 'Atlas plugin system', body: 'Allow users to build custom widgets and data sources. Need a plugin manifest format and sandbox.', tags: ['dev', 'product'], color: 'var(--blue)' },
    { id: 'i2', title: 'Weekly review template', body: 'A structured 30-min Sunday template for reflection, goal check-in, and next-week planning.', tags: ['productivity'], color: 'var(--accent)' },
    { id: 'i3', title: 'Offline-first architecture', body: 'All data local, sync in background. Need conflict resolution strategy for multi-device.', tags: ['dev', 'architecture'], color: 'var(--violet)' },
    { id: 'i4', title: 'Habit-goal linking', body: 'Auto-suggest linking habits to goals. Morning run → Run 500mi goal.', tags: ['product', 'ux'], color: 'var(--warm)' },
    { id: 'i5', title: 'Reading club feature', body: 'Share highlights with friends, discuss books. Private groups, weekly picks.', tags: ['social', 'reading'], color: 'var(--p2)' },
  ],
  journalEntries: [
    {
      id: 'j1',
      date: 'Jun 29, 2026',
      text: "Today felt productive despite the morning chaos. The Q2 review prep is hanging over me, but the focus block Scout added actually helped — got 60% of the slides done before lunch. Had a good conversation with Sarah about the server issues; feels resolved now.\n\nNeed to think more carefully about how I'm prioritizing. Three P1 tasks sitting in my inbox is a sign I've been avoiding hard conversations...",
    },
  ],
  calEvents: [
    { id: 'ce1', title: 'Team standup', start: 9, duration: 0.5, color: 'var(--blue)', category: 'Work', date: 29 },
    { id: 'ce2', title: 'Focus block — slides', start: 11, duration: 1.5, color: 'var(--violet)', category: 'Focus', date: 29 },
    { id: 'ce3', title: 'Lunch with Sarah', start: 13, duration: 1, color: 'var(--warm)', category: 'Personal', date: 29 },
    { id: 'ce4', title: 'Q2 Review', start: 15, duration: 1, color: 'var(--blue)', category: 'Work', date: 29 },
    { id: 'ce5', title: 'Gym', start: 17.5, duration: 1, color: 'var(--accent)', category: 'Health', date: 29 },
  ],
  calNote: 'Prep Q2 talking points before 3pm\nSend budget sign-off to Mark\nBlock time for blog post this week',
  adlerMemory: [],
  adlerNotes: '',
  adlerLastContact: 0,
  briefingText: '',
  briefingNudges: [],
  briefingGeneratedAt: 0,
};

// Deep clone seed so we can reset if needed
let _state: ServerState = JSON.parse(JSON.stringify(seedState));

type Listener = (state: ServerState) => void;
const listeners: Listener[] = [];

// ── Upstash Redis persistence ─────────────────────────────────────────────────

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;
const STATE_KEY = 'atlas:state';

async function redisFetch(path: string, options?: RequestInit): Promise<unknown> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const res = await fetch(`${REDIS_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json', ...options?.headers },
  });
  return res.json();
}

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => persistNow(), 500);
}

export async function persistNow(): Promise<void> {
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
  try {
    await redisFetch(`/set/${STATE_KEY}`, {
      method: 'POST',
      body: JSON.stringify(JSON.stringify(_state)),
    });
  } catch (err) {
    console.error('State persist error:', err);
  }
}

export async function loadPersistedState(): Promise<void> {
  try {
    const res = await redisFetch(`/get/${STATE_KEY}`) as { result: string | null };
    if (res?.result) {
      const saved = JSON.parse(res.result) as Partial<ServerState>;
      // Merge saved over seed so new fields added in code still get defaults
      _state = { ...JSON.parse(JSON.stringify(seedState)), ...saved };
      console.log('State restored from Redis');
    } else {
      console.log('No saved state in Redis — using seed data');
    }
  } catch (err) {
    console.error('State load error (using seed):', err);
  }
}

// ── Core state API ────────────────────────────────────────────────────────────

export function getState(): ServerState {
  return _state;
}

export function setState(partial: Partial<ServerState>): void {
  _state = { ..._state, ...partial };
  listeners.forEach((fn) => fn(_state));
  persistNow(); // fire-and-forget — no debounce, every change goes to Redis
}

export function subscribe(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

// ── Typed helper actions ──────────────────────────────────────────────────────

export function addTask(task: Omit<Task, 'id'>): Task {
  const newTask: Task = { ...task, id: `t-${Date.now()}` };
  setState({ tasks: [..._state.tasks, newTask] });
  return newTask;
}

export function toggleTask(id: string): void {
  setState({
    tasks: _state.tasks.map((t) => {
      if (t.id !== id) return t;
      if (t.column === 'today') return { ...t, done: true, column: 'done' as const };
      if (t.column === 'done') return { ...t, done: false, column: 'today' as const };
      return t;
    }),
  });
}

export function editTask(id: string, updates: Partial<Pick<Task, 'title' | 'priority' | 'category'>>): void {
  setState({
    tasks: _state.tasks.map((t) => t.id === id ? { ...t, ...updates } : t),
  });
}

export function deleteTask(id: string): void {
  setState({ tasks: _state.tasks.filter((t) => t.id !== id) });
}

export function moveTask(id: string, column: 'today' | 'upcoming' | 'done'): void {
  setState({
    tasks: _state.tasks.map((t) =>
      t.id === id ? { ...t, column, done: column === 'done' } : t
    ),
  });
}

export function acceptAction(actionId: string): void {
  const action = _state.proposedActions.find((a) => a.id === actionId);
  if (!action) return;
  const newTasks = [..._state.tasks];
  if (action.kind === 'todo') {
    newTasks.push({
      id: `t-${Date.now()}`,
      title: action.text.replace('Add to-do: ', ''),
      category: 'Work',
      priority: action.priority ?? 'p2',
      done: false,
      agentBadge: 'From inbox',
      column: 'today',
    });
  }
  setState({
    tasks: newTasks,
    proposedActions: _state.proposedActions.map((a) =>
      a.id === actionId ? { ...a, status: 'accepted' } : a
    ),
  });
}

export function dismissAction(actionId: string): void {
  setState({
    proposedActions: _state.proposedActions.map((a) =>
      a.id === actionId ? { ...a, status: 'dismissed' } : a
    ),
  });
}

export function sendDraft(id: string): void {
  setState({
    drafts: _state.drafts.map((d) => (d.id === id ? { ...d, status: 'sent' } : d)),
  });
}

export function discardDraft(id: string): void {
  setState({
    drafts: _state.drafts.map((d) => (d.id === id ? { ...d, status: 'discarded' } : d)),
  });
}

export function snoozeComm(commId: string): void {
  setState({
    comms: _state.comms.map((c) => (c.id === commId ? { ...c, status: 'snoozed' } : c)),
  });
}

export function addTodoFromComm(commId: string): void {
  const comm = _state.comms.find((c) => c.id === commId);
  if (!comm) return;
  setState({
    tasks: [
      ..._state.tasks,
      {
        id: `t-${Date.now()}`,
        title: `Reply to ${comm.who}: ${comm.subject}`,
        category: 'Work',
        priority: comm.priority,
        done: false,
        agentBadge: 'From inbox',
        column: 'today' as const,
      },
    ],
    comms: _state.comms.map((c) => (c.id === commId ? { ...c, status: 'snoozed' } : c)),
  });
}

export function toggleHabitToday(id: string): void {
  setState({
    habits: _state.habits.map((h) => {
      if (h.id !== id) return h;
      const completing = !h.completedToday;
      const newStreak = completing ? h.streak + 1 : Math.max(0, h.streak - 1);
      const newPct = completing
        ? Math.min(1, h.pct + 1 / 7)
        : Math.max(0, h.pct - 1 / 7);
      return { ...h, completedToday: completing, streak: newStreak, pct: newPct };
    }),
  });
}

export function updateGoalProgress(id: string, pct: number): void {
  setState({
    goals: _state.goals.map((g) =>
      g.id === id ? { ...g, pct: Math.max(0, Math.min(100, pct)) } : g
    ),
  });
}

export function addCalEvent(event: Omit<CalEvent, 'id'>): CalEvent {
  const newEvent: CalEvent = { ...event, id: `ce-${Date.now()}` };
  setState({ calEvents: [..._state.calEvents, newEvent] });
  return newEvent;
}

export function addGoal(name: string, target: string, deadline: string, color: string): Goal {
  const newGoal: Goal = {
    id: `g-${Date.now()}`,
    name,
    pct: 0,
    current: '0',
    target,
    deadline,
    deadlineShort: deadline.slice(0, 3) + "'26",
    tasks: 0,
    color,
  };
  setState({ goals: [..._state.goals, newGoal] });
  return newGoal;
}

export function startReading(id: string): void {
  setState({
    books: _state.books.map((b) =>
      b.id === id ? { ...b, status: 'reading' as const, chapter: 'ch. 1' } : b
    ),
  });
}
