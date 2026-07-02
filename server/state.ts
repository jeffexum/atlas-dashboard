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
  email?: string;
  subject: string;
  preview: string;
  body?: string;
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
  month?: number;
  year?: number;
  source?: 'work' | 'personal';
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
  userProfile: string;
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
  userProfile: '',
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
  const res = await redisFetch(`/set/${key}`, { method: 'POST', body: JSON.stringify(value) }) as
    { result?: string; error?: string } | null;
  if (res === null) return; // Redis not configured
  if (res.error || res.result !== 'OK') {
    throw new Error(`Redis SET ${key} failed: ${res.error || JSON.stringify(res)}`);
  }
}

async function redisGet<T>(key: string): Promise<T | null> {
  const res = await redisFetch(`/get/${key}`) as { result: string | null } | null;
  if (!res?.result) return null;
  try {
    let parsed: unknown = JSON.parse(res.result);
    // Legacy values were double-encoded (JSON string of a JSON string) — unwrap once more
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { /* genuine string value — keep as-is */ }
    }
    return parsed as T;
  } catch {
    // Value stored as raw text (not JSON) — return it verbatim
    return res.result as unknown as T;
  }
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
  userProfile: 'atlas:userProfile',
} as const;

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => persistNow(), 500);
}

export async function persistNow(): Promise<Record<string, string>> {
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
  const results: Record<string, string> = {};
  const trySet = async (key: string, value: unknown) => {
    try {
      await redisSet(key, value);
      results[key] = 'OK';
    } catch (err) {
      results[key] = (err as Error).message;
      console.error(`Persist failed for ${key}:`, (err as Error).message);
    }
  };
  await Promise.all([
    trySet(KEYS.tasks, _state.tasks),
    trySet(KEYS.comms, _state.comms),
    trySet(KEYS.drafts, _state.drafts),
    trySet(KEYS.proposedActions, _state.proposedActions),
    trySet(KEYS.habits, _state.habits),
    trySet(KEYS.goals, _state.goals),
    trySet(KEYS.books, _state.books),
    trySet(KEYS.highlights, _state.highlights),
    trySet(KEYS.ideas, _state.ideas),
    trySet(KEYS.journalEntries, _state.journalEntries),
    trySet(KEYS.calEvents, _state.calEvents),
    trySet(KEYS.calNote, _state.calNote),
    trySet(KEYS.adlerNotes, _state.adlerNotes),
    trySet(KEYS.adlerMemory, _state.adlerMemory.slice(-20)),
    trySet(KEYS.adlerLastContact, _state.adlerLastContact),
    trySet(KEYS.briefingText, _state.briefingText),
    trySet(KEYS.briefingNudges, _state.briefingNudges),
    trySet(KEYS.briefingGeneratedAt, _state.briefingGeneratedAt),
    trySet(KEYS.userProfile, _state.userProfile),
  ]);
  const failed = Object.entries(results).filter(([, v]) => v !== 'OK');
  console.log(failed.length
    ? `State persisted with ${failed.length} FAILURES: ${failed.map(([k]) => k).join(', ')}`
    : `State persisted: ${_state.tasks.length} tasks, ${_state.comms.length} comms, ${_state.calEvents.length} calEvents`);
  return results;
}


export async function loadPersistedState(): Promise<void> {
  try {
    // Raw debug read so we can see exactly what Redis returns for tasks
    const rawTasksRes = await redisFetch(`/get/${KEYS.tasks}`) as { result: unknown } | null;
    console.log('Redis atlas:tasks raw result type:', typeof rawTasksRes?.result, '| value:', JSON.stringify(rawTasksRes?.result)?.slice(0, 200));

    const [
      tasks, comms, drafts, proposedActions, habits, goals, books,
      highlights, ideas, journalEntries, calEvents, calNote,
      adlerNotes, adlerMemory, adlerLastContact,
      briefingText, briefingNudges, briefingGeneratedAt, userProfile,
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
      redisGet<string>(KEYS.userProfile),
    ]);

    _state = sanitize({
      tasks: Array.isArray(tasks) ? tasks : [],
      comms: Array.isArray(comms) ? comms : [],
      drafts: Array.isArray(drafts) ? drafts : [],
      proposedActions: Array.isArray(proposedActions) ? proposedActions : [],
      habits: Array.isArray(habits) ? habits : [],
      goals: Array.isArray(goals) ? goals : [],
      books: Array.isArray(books) ? books : [],
      highlights: Array.isArray(highlights) ? highlights : [],
      ideas: Array.isArray(ideas) ? ideas : [],
      journalEntries: Array.isArray(journalEntries) ? journalEntries : [],
      calEvents: Array.isArray(calEvents) ? calEvents : [],
      calNote: typeof calNote === 'string' ? calNote : '',
      adlerNotes: (adlerNotes && typeof adlerNotes === 'object' && !Array.isArray(adlerNotes)) ? adlerNotes : {},
      adlerMemory: Array.isArray(adlerMemory) ? adlerMemory : [],
      adlerLastContact: typeof adlerLastContact === 'number' ? adlerLastContact : 0,
      briefingText: typeof briefingText === 'string' ? briefingText : '',
      briefingNudges: Array.isArray(briefingNudges) ? briefingNudges : [],
      briefingGeneratedAt: typeof briefingGeneratedAt === 'number' ? briefingGeneratedAt : 0,
      userProfile: typeof userProfile === 'string' ? userProfile : '',
    });
    console.log(`State restored from Redis: ${_state.tasks.length} tasks`);
    return;
  } catch (err) {
    console.error('State load error (keeping current state):', err);
    return;
  }
}

// The one-time legacy migration is done. The old atlas:state blob must be deleted:
// it re-imported stale data on every boot (the guard checked tasks.length, which is
// often legitimately 0) and overwrote freshly restored collections.
export async function migrateLegacyState(): Promise<void> {
  try {
    await redisFetch('/del/atlas:state', { method: 'POST' });
    console.log('Legacy atlas:state key deleted');
  } catch {
    // best-effort
  }
}

// ── Core state API ────────────────────────────────────────────────────────────

const ARRAY_FIELDS: (keyof ServerState)[] = [
  'tasks', 'comms', 'drafts', 'proposedActions', 'habits', 'goals',
  'books', 'highlights', 'ideas', 'journalEntries', 'calEvents',
  'adlerMemory', 'briefingNudges',
];

function sanitize(s: ServerState): ServerState {
  const out = { ...s };
  for (const k of ARRAY_FIELDS) {
    if (!Array.isArray(out[k])) {
      console.warn(`state.${k} was not an array (${typeof out[k]}), resetting to []`);
      (out as Record<string, unknown>)[k] = [];
    }
  }
  if (typeof out.adlerNotes !== 'object' || Array.isArray(out.adlerNotes) || out.adlerNotes === null) {
    out.adlerNotes = {};
  }
  return out;
}

export function getState(): ServerState {
  return _state;
}

export function setState(partial: Partial<ServerState>): void {
  _state = sanitize({ ..._state, ...partial });
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
