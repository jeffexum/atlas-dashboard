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
  adlerNotes: Record<string, string>;
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
  tasks: [],
  comms: [],
  drafts: [],
  proposedActions: [],
  habits: [],
  goals: [],
  books: [],
  highlights: [],
  ideas: [],
  journalEntries: [],
  calEvents: [],
  calNote: '',
  adlerMemory: [],
  adlerNotes: {},
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

async function redisFetch(path: string, options?: RequestInit): Promise<unknown> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const res = await fetch(`${REDIS_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json', ...options?.headers },
  });
  return res.json();
}

async function redisSet(key: string, value: unknown): Promise<void> {
  await redisFetch(`/set/${key}`, { method: 'POST', body: JSON.stringify(JSON.stringify(value)) });
}

async function redisGet<T>(key: string): Promise<T | null> {
  const res = await redisFetch(`/get/${key}`) as { result: string | null } | null;
  if (!res?.result) return null;
  return JSON.parse(res.result) as T;
}

// Collections persisted as individual keys so each can grow independently
const KEYS = {
  tasks: 'atlas:tasks',
  comms: 'atlas:comms',
  drafts: 'atlas:drafts',
  proposedActions: 'atlas:proposedActions',
  habits: 'atlas:habits',
  goals: 'atlas:goals',
  books: 'atlas:books',
  highlights: 'atlas:highlights',
  ideas: 'atlas:ideas',
  journalEntries: 'atlas:journalEntries',
  calEvents: 'atlas:calEvents',
  calNote: 'atlas:calNote',
  adlerNotes: 'atlas:adlerNotes',
  adlerMemory: 'atlas:adlerMemory',
  adlerLastContact: 'atlas:adlerLastContact',
  briefingText: 'atlas:briefingText',
  briefingNudges: 'atlas:briefingNudges',
  briefingGeneratedAt: 'atlas:briefingGeneratedAt',
} as const;

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => persistNow(), 500);
}

export async function persistNow(): Promise<void> {
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
  try {
    await Promise.all([
      redisSet(KEYS.tasks, _state.tasks),
      redisSet(KEYS.comms, _state.comms),
      redisSet(KEYS.drafts, _state.drafts),
      redisSet(KEYS.proposedActions, _state.proposedActions),
      redisSet(KEYS.habits, _state.habits),
      redisSet(KEYS.goals, _state.goals),
      redisSet(KEYS.books, _state.books),
      redisSet(KEYS.highlights, _state.highlights),
      redisSet(KEYS.ideas, _state.ideas),
      redisSet(KEYS.journalEntries, _state.journalEntries),
      redisSet(KEYS.calEvents, _state.calEvents),
      redisSet(KEYS.calNote, _state.calNote),
      redisSet(KEYS.adlerNotes, _state.adlerNotes),
      redisSet(KEYS.adlerMemory, _state.adlerMemory.slice(-20)),
      redisSet(KEYS.adlerLastContact, _state.adlerLastContact),
      redisSet(KEYS.briefingText, _state.briefingText),
      redisSet(KEYS.briefingNudges, _state.briefingNudges),
      redisSet(KEYS.briefingGeneratedAt, _state.briefingGeneratedAt),
    ]);
    console.log(`State persisted: ${_state.tasks.length} tasks`);
  } catch (err) {
    console.error('State persist error:', err);
  }
}

export async function loadPersistedState(): Promise<void> {
  try {
    const [
      tasks, comms, drafts, proposedActions, habits, goals, books,
      highlights, ideas, journalEntries, calEvents, calNote,
      adlerNotes, adlerMemory, adlerLastContact,
      briefingText, briefingNudges, briefingGeneratedAt,
    ] = await Promise.all([
      redisGet<ServerState['tasks']>(KEYS.tasks),
      redisGet<ServerState['comms']>(KEYS.comms),
      redisGet<ServerState['drafts']>(KEYS.drafts),
      redisGet<ServerState['proposedActions']>(KEYS.proposedActions),
      redisGet<ServerState['habits']>(KEYS.habits),
      redisGet<ServerState['goals']>(KEYS.goals),
      redisGet<ServerState['books']>(KEYS.books),
      redisGet<ServerState['highlights']>(KEYS.highlights),
      redisGet<ServerState['ideas']>(KEYS.ideas),
      redisGet<ServerState['journalEntries']>(KEYS.journalEntries),
      redisGet<ServerState['calEvents']>(KEYS.calEvents),
      redisGet<string>(KEYS.calNote),
      redisGet<ServerState['adlerNotes']>(KEYS.adlerNotes),
      redisGet<ServerState['adlerMemory']>(KEYS.adlerMemory),
      redisGet<number>(KEYS.adlerLastContact),
      redisGet<string>(KEYS.briefingText),
      redisGet<string[]>(KEYS.briefingNudges),
      redisGet<number>(KEYS.briefingGeneratedAt),
    ]);

    _state = {
      tasks: tasks ?? [],
      comms: comms ?? [],
      drafts: drafts ?? [],
      proposedActions: proposedActions ?? [],
      habits: habits ?? [],
      goals: goals ?? [],
      books: books ?? [],
      highlights: highlights ?? [],
      ideas: ideas ?? [],
      journalEntries: journalEntries ?? [],
      calEvents: calEvents ?? [],
      calNote: calNote ?? '',
      adlerNotes: (adlerNotes && typeof adlerNotes === 'object' && !Array.isArray(adlerNotes)) ? adlerNotes : {},
      adlerMemory: adlerMemory ?? [],
      adlerLastContact: adlerLastContact ?? 0,
      briefingText: briefingText ?? '',
      briefingNudges: briefingNudges ?? [],
      briefingGeneratedAt: briefingGeneratedAt ?? 0,
    };
    console.log(`State restored from Redis: ${_state.tasks.length} tasks`);
    return;
  } catch (err) {
    console.error('State load error (keeping current state):', err);
    return;
  }
}

// Legacy single-key migration: if old atlas:state key exists, import it once
export async function migrateLegacyState(): Promise<void> {
  try {
    const legacy = await redisGet<Partial<ServerState>>('atlas:state');
    if (!legacy || typeof legacy !== 'object') return;
    const s = legacy as Partial<ServerState>;
    if (!Array.isArray(s.tasks)) return;
    // Only migrate if current state is empty (fresh instance)
    if (_state.tasks.length > 0) return;
    // Null-safe merge: only overwrite fields that are valid in the old blob
    _state = {
      ..._state,
      tasks: Array.isArray(s.tasks) ? s.tasks : _state.tasks,
      comms: Array.isArray(s.comms) ? s.comms : _state.comms,
      drafts: Array.isArray(s.drafts) ? s.drafts : _state.drafts,
      proposedActions: Array.isArray(s.proposedActions) ? s.proposedActions : _state.proposedActions,
      habits: Array.isArray(s.habits) ? s.habits : _state.habits,
      goals: Array.isArray(s.goals) ? s.goals : _state.goals,
      books: Array.isArray(s.books) ? s.books : _state.books,
      highlights: Array.isArray(s.highlights) ? s.highlights : _state.highlights,
      ideas: Array.isArray(s.ideas) ? s.ideas : _state.ideas,
      journalEntries: Array.isArray(s.journalEntries) ? s.journalEntries : _state.journalEntries,
      calEvents: Array.isArray(s.calEvents) ? s.calEvents : _state.calEvents,
      calNote: typeof s.calNote === 'string' ? s.calNote : _state.calNote,
      adlerNotes: (s.adlerNotes && typeof s.adlerNotes === 'object' && !Array.isArray(s.adlerNotes)) ? s.adlerNotes : _state.adlerNotes,
      adlerMemory: Array.isArray(s.adlerMemory) ? s.adlerMemory : _state.adlerMemory,
      adlerLastContact: typeof s.adlerLastContact === 'number' ? s.adlerLastContact : _state.adlerLastContact,
      briefingText: typeof s.briefingText === 'string' ? s.briefingText : _state.briefingText,
      briefingNudges: Array.isArray(s.briefingNudges) ? s.briefingNudges : _state.briefingNudges,
      briefingGeneratedAt: typeof s.briefingGeneratedAt === 'number' ? s.briefingGeneratedAt : _state.briefingGeneratedAt,
    };
    await persistNow(); // write to new per-key format
    console.log(`Migrated legacy state: ${_state.tasks.length} tasks`);
  } catch {
    // ignore — migration is best-effort
  }
}

// ── Core state API ────────────────────────────────────────────────────────────

export function getState(): ServerState {
  return _state;
}

export function setState(partial: Partial<ServerState>): void {
  _state = { ..._state, ...partial };
  listeners.forEach((fn) => fn(_state));
  schedulePersist();
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
