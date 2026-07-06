// server/state.ts — in-memory mirror of the Zustand store shape

export interface Task {
  id: string;
  title: string;
  category: string;
  priority: 'p1' | 'p2' | 'p3';
  done: boolean;
  agentBadge?: string;
  column: 'today' | 'upcoming' | 'done';
  // Optional due date, Denver-local YYYY-MM-DD
  dueDate?: string;
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
  receivedAt?: number; // ms epoch, for sorting
  priority: 'p1' | 'p2' | 'p3';
  status: 'open' | 'snoozed' | 'dismissed';
}

export interface Draft {
  id: string;
  to: string;
  re: string;
  text: string;
  status: 'ready' | 'sent' | 'discarded';
  // Graph message id of the email this draft replies to — send as in-thread reply when set
  commId?: string;
  cc?: string;  // comma-separated additional recipients
  bcc?: string;
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
  // Source of truth: Denver-local YYYY-MM-DD dates the habit was completed.
  // streak/rate/pct/completedToday/heatmap are all derived from this.
  history?: string[];
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

// A person from the user's mail history / Outlook address book.
export interface Contact {
  name: string;
  email: string;
  count: number;   // how often they appear in sent/received mail
  lastAt: number;  // ms timestamp of most recent interaction
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
  allDay?: boolean;
}

// One day of Oura Ring data (all fields optional — synced days may be partial)
export interface HealthDay {
  date: string; // YYYY-MM-DD
  sleepScore?: number;
  readinessScore?: number;
  activityScore?: number;
  sleepHours?: number;
  deepHours?: number;
  remHours?: number;
  lightHours?: number;
  efficiency?: number;
  restingHR?: number;
  hrv?: number;
  tempDeviation?: number;
  steps?: number;
  activeCalories?: number;
}

export type ShoppingCategory = 'Groceries' | 'House' | 'Misc';

export interface ShoppingItem {
  id: string;
  name: string;
  category: ShoppingCategory;
  done: boolean;
  addedBy?: string; // 'Jeff' | 'Adler' | 'Lacy' — who put it on the list
  addedAt?: number;
}

// Uploaded reference document (e.g. markdown exported from ChatGPT) — the
// assistant sees a distilled summary in memory and can read the full text on demand
export interface KnowledgeDoc {
  id: string;
  name: string;
  content: string;
  summary?: string;
  addedAt: number;
}

// A commitment someone made — extracted from email or added manually.
// "Mike will send the redline by Friday" → what/who/due, tracked to done.
export interface Delegation {
  id: string;
  what: string;
  who: string;
  dueDate?: string;        // YYYY-MM-DD local
  sourceCommId?: string;   // email it was extracted from
  sourceQuote?: string;    // the sentence that contained the commitment
  status: 'open' | 'nudged' | 'done' | 'slipped';
  createdAt: number;
  updatedAt: number;
}

export interface AdlerMessage {
  role: 'user' | 'adler';
  content: string;
  ts: number;
}

// ── Day Builder ───────────────────────────────────────────────────────────────
// A collaboratively built plan for one day: Adler proposes blocks from the full
// context (tasks, inbox, habits, health, calendar), the user iterates in chat,
// and confirming books real calendar events + queues the email block in the Inbox.
export interface DayBlock {
  id: string;
  start: number;      // start hour, decimal local time (e.g. 9.5)
  duration: number;   // hours
  kind: 'email' | 'deep-work' | 'meeting' | 'habit' | 'exercise' | 'creative' | 'personal' | 'break';
  title: string;
  note?: string;
  taskIds?: string[]; // to-dos this block covers
  commIds?: string[]; // inbox emails handled in this block (email kind)
  habitId?: string;   // habit this block fulfills
  bookTo?: 'work' | 'personal' | 'none'; // which real calendar on confirm
  bookedEventId?: string; // set once booked
}

export interface DayPlan {
  date: string; // YYYY-MM-DD in the user's timezone
  status: 'draft' | 'confirmed';
  blocks: DayBlock[];
  updatedAt: number;
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
  health: HealthDay[];
  shopping: ShoppingItem[];
  knowledge: KnowledgeDoc[];
  delegations: Delegation[];
  calNote: string;
  adlerMemory: AdlerMessage[];
  adlerNotes: Record<string, string>;
  adlerLastContact: number;
  briefingText: string;
  briefingNudges: string[];
  briefingGeneratedAt: number;
  userProfile: string;
  // Durable dismissed/snoozed overrides keyed by comm id, so a hidden email stays
  // hidden even if the AI scorer drops it from one sync then re-includes it later.
  commStatusOverrides: Record<string, 'dismissed' | 'snoozed'>;
  dayPlan: DayPlan | null;
  contacts: Contact[];
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
  health: [],
  shopping: [],
  knowledge: [],
  delegations: [],
  calNote: '',
  adlerMemory: [],
  adlerNotes: {},
  adlerLastContact: 0,
  briefingText: '',
  briefingNudges: [],
  briefingGeneratedAt: 0,
  userProfile: '',
  commStatusOverrides: {},
  dayPlan: null,
  contacts: [],
};

// Deep clone seed so we can reset if needed
let _state: ServerState = JSON.parse(JSON.stringify(seedState));

type Listener = (state: ServerState) => void;
const listeners: Listener[] = [];

// ── Upstash Redis persistence ─────────────────────────────────────────────────

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;
const REDIS_CONFIGURED = !!(REDIS_URL && REDIS_TOKEN);

// Guard against clobbering persisted data: when Redis is configured we must NOT
// write until an initial load has verifiably succeeded, otherwise a transient
// Redis error at boot would let the empty seed state overwrite every key.
// When Redis is not configured (local dev) there is nothing to lose, so allow writes.
let _loadedOk = !REDIS_CONFIGURED;
export function isLoadedOk(): boolean { return _loadedOk; }

async function redisFetch(path: string, options?: RequestInit): Promise<unknown> {
  if (!REDIS_CONFIGURED) return null;
  const res = await fetch(`${REDIS_URL}${path}`, {
    ...options,
    signal: AbortSignal.timeout(15_000),
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
  health: 'atlas:health',
  shopping: 'atlas:shopping',
  knowledge: 'atlas:knowledge',
  delegations: 'atlas:delegations',
  calNote: 'atlas:calNote',
  adlerNotes: 'atlas:adlerNotes',
  adlerMemory: 'atlas:adlerMemory',
  adlerLastContact: 'atlas:adlerLastContact',
  briefingText: 'atlas:briefingText',
  briefingNudges: 'atlas:briefingNudges',
  briefingGeneratedAt: 'atlas:briefingGeneratedAt',
  userProfile: 'atlas:userProfile',
  dayPlan: 'atlas:dayPlan',
  contacts: 'atlas:contacts',
  commStatusOverrides: 'atlas:commStatusOverrides',
} as const;

let _persistTimer: ReturnType<typeof setTimeout> | null = null;
// Serialize persists so an older slow flush can't land after a newer one.
let _persistLock: Promise<unknown> = Promise.resolve();

// Write-time caps so no single Redis key grows past Upstash's per-request limit.
const CAPS = { comms: 300, calEvents: 500, health: 120, journalEntries: 500, ideas: 500, adlerMemory: 20 };
function tail<T>(arr: T[], n: number): T[] { return arr.length > n ? arr.slice(-n) : arr; }

function schedulePersist(): void {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => { persistNow().catch(() => {}); }, 500);
}

export async function persistNow(): Promise<Record<string, string>> {
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
  // Chain onto the previous persist so writes never overlap or reorder.
  const run = _persistLock.then(() => _persistNow());
  _persistLock = run.catch(() => {});
  return run;
}

async function _persistNow(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  if (REDIS_CONFIGURED && !_loadedOk) {
    console.error('Refusing to persist: initial Redis load has not succeeded (guarding against data-loss clobber)');
    return { _blocked: 'load-not-ok' };
  }
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
    trySet(KEYS.comms, tail(_state.comms, CAPS.comms)),
    trySet(KEYS.drafts, _state.drafts),
    trySet(KEYS.proposedActions, _state.proposedActions),
    trySet(KEYS.habits, _state.habits),
    trySet(KEYS.goals, _state.goals),
    trySet(KEYS.books, _state.books),
    trySet(KEYS.highlights, _state.highlights),
    trySet(KEYS.ideas, tail(_state.ideas, CAPS.ideas)),
    trySet(KEYS.journalEntries, tail(_state.journalEntries, CAPS.journalEntries)),
    trySet(KEYS.calEvents, tail(_state.calEvents, CAPS.calEvents)),
    trySet(KEYS.health, tail(_state.health, CAPS.health)),
    trySet(KEYS.shopping, _state.shopping),
    trySet(KEYS.knowledge, _state.knowledge),
    trySet(KEYS.delegations, _state.delegations),
    trySet(KEYS.calNote, _state.calNote),
    trySet(KEYS.adlerNotes, _state.adlerNotes),
    trySet(KEYS.adlerMemory, _state.adlerMemory.slice(-20)),
    trySet(KEYS.adlerLastContact, _state.adlerLastContact),
    trySet(KEYS.briefingText, _state.briefingText),
    trySet(KEYS.briefingNudges, _state.briefingNudges),
    trySet(KEYS.briefingGeneratedAt, _state.briefingGeneratedAt),
    trySet(KEYS.userProfile, _state.userProfile),
    trySet(KEYS.dayPlan, _state.dayPlan),
    trySet(KEYS.contacts, tail(_state.contacts, 500)),
    trySet(KEYS.commStatusOverrides, _state.commStatusOverrides),
  ]);
  const failed = Object.entries(results).filter(([, v]) => v !== 'OK');
  console.log(failed.length
    ? `State persisted with ${failed.length} FAILURES: ${failed.map(([k]) => k).join(', ')}`
    : `State persisted: ${_state.tasks.length} tasks, ${_state.comms.length} comms, ${_state.calEvents.length} calEvents`);
  return results;
}


// Verify Redis is actually reachable and authenticated — distinguishes a genuinely
// empty (fresh) instance from a connection/auth failure that returns no data.
async function redisProbe(): Promise<void> {
  const res = await redisFetch('/get/atlas:__loadprobe__') as { result?: unknown; error?: string } | null;
  if (res === null) return; // not configured — caller handles
  if (res.error) throw new Error(`Redis probe error: ${res.error}`);
  if (!('result' in res)) throw new Error('Redis probe: unexpected response shape');
}

export async function loadPersistedState(): Promise<void> {
  if (!REDIS_CONFIGURED) { _loadedOk = true; return; }
  // Retry with backoff — a transient error must NOT be mistaken for an empty instance.
  const delays = [0, 1000, 3000, 8000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await new Promise((r) => setTimeout(r, delays[attempt]));
    try {
      await redisProbe();
      await _loadOnce();
      _loadedOk = true;
      return;
    } catch (err) {
      console.error(`State load attempt ${attempt + 1}/${delays.length} failed:`, (err as Error).message);
    }
  }
  // All attempts failed: leave _loadedOk false so persistNow refuses to clobber Redis.
  console.error('State load FAILED after retries — running in read-only mode (persistence disabled until a load succeeds)');
}

async function _loadOnce(): Promise<void> {
  {
    const [
      tasks, comms, drafts, proposedActions, habits, goals, books,
      highlights, ideas, journalEntries, calEvents, health, shopping, knowledge, delegations, calNote,
      adlerNotes, adlerMemory, adlerLastContact,
      briefingText, briefingNudges, briefingGeneratedAt, userProfile, commStatusOverrides, dayPlan, contacts,
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
      redisGet<ServerState['health']>(KEYS.health),
      redisGet<ServerState['shopping']>(KEYS.shopping),
      redisGet<ServerState['knowledge']>(KEYS.knowledge),
      redisGet<ServerState['delegations']>(KEYS.delegations),
      redisGet<string>(KEYS.calNote),
      redisGet<ServerState['adlerNotes']>(KEYS.adlerNotes),
      redisGet<ServerState['adlerMemory']>(KEYS.adlerMemory),
      redisGet<number>(KEYS.adlerLastContact),
      redisGet<string>(KEYS.briefingText),
      redisGet<string[]>(KEYS.briefingNudges),
      redisGet<number>(KEYS.briefingGeneratedAt),
      redisGet<string>(KEYS.userProfile),
      redisGet<ServerState['commStatusOverrides']>(KEYS.commStatusOverrides),
      redisGet<ServerState['dayPlan']>(KEYS.dayPlan),
      redisGet<ServerState['contacts']>(KEYS.contacts),
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
      health: Array.isArray(health) ? health : [],
      shopping: Array.isArray(shopping) ? shopping : [],
      knowledge: Array.isArray(knowledge) ? knowledge : [],
      delegations: Array.isArray(delegations) ? delegations : [],
      calNote: typeof calNote === 'string' ? calNote : '',
      adlerNotes: (adlerNotes && typeof adlerNotes === 'object' && !Array.isArray(adlerNotes)) ? adlerNotes : {},
      adlerMemory: Array.isArray(adlerMemory) ? adlerMemory : [],
      adlerLastContact: typeof adlerLastContact === 'number' ? adlerLastContact : 0,
      briefingText: typeof briefingText === 'string' ? briefingText : '',
      briefingNudges: Array.isArray(briefingNudges) ? briefingNudges : [],
      briefingGeneratedAt: typeof briefingGeneratedAt === 'number' ? briefingGeneratedAt : 0,
      userProfile: typeof userProfile === 'string' ? userProfile : '',
      commStatusOverrides: (commStatusOverrides && typeof commStatusOverrides === 'object' && !Array.isArray(commStatusOverrides)) ? commStatusOverrides : {},
      dayPlan: (dayPlan && typeof dayPlan === 'object' && !Array.isArray(dayPlan) && Array.isArray((dayPlan as { blocks?: unknown }).blocks)) ? dayPlan : null,
      contacts: Array.isArray(contacts) ? contacts : [],
    });
    console.log(`State restored from Redis: ${_state.tasks.length} tasks`);
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
  'books', 'highlights', 'ideas', 'journalEntries', 'calEvents', 'health', 'shopping', 'knowledge', 'delegations',
  'adlerMemory', 'briefingNudges', 'contacts',
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

export function editTask(id: string, updates: Partial<Pick<Task, 'title' | 'priority' | 'category' | 'dueDate'>>): void {
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

export function dismissComm(commId: string): void {
  setState({
    comms: _state.comms.map((c) => (c.id === commId ? { ...c, status: 'dismissed' as const } : c)),
    commStatusOverrides: { ..._state.commStatusOverrides, [commId]: 'dismissed' },
  });
}

export function snoozeComm(commId: string): void {
  setState({
    comms: _state.comms.map((c) => (c.id === commId ? { ...c, status: 'snoozed' } : c)),
    commStatusOverrides: { ..._state.commStatusOverrides, [commId]: 'snoozed' },
  });
}

// Durable hidden-status lookup for sync paths (survives the AI scorer dropping then
// re-including an email).
export function commStatusOverride(commId: string): 'dismissed' | 'snoozed' | undefined {
  return _state.commStatusOverrides[commId];
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

// ── Habits: history-based tracking (Denver-local days) ───────────────────────

import { USER } from './config.js';
const HABIT_TZ = USER.tz;
const DAY_MS = 86_400_000;

function denverDay(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: HABIT_TZ }); // YYYY-MM-DD
}

export function recomputeHabit(h: Habit): Habit {
  const history = [...new Set(h.history || [])].sort();
  const done = new Set(history);
  const today = denverDay();
  const completedToday = done.has(today);

  // Current streak: consecutive days ending today (or yesterday if today isn't logged yet)
  let streak = 0;
  let cursor = completedToday ? new Date() : new Date(Date.now() - DAY_MS);
  while (done.has(denverDay(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  // 30-day completion rate
  let done30 = 0;
  for (let i = 0; i < 30; i++) {
    if (done.has(denverDay(new Date(Date.now() - i * DAY_MS)))) done30++;
  }

  // Heatmap: last 25 days, oldest → newest
  const heatmap = Array.from({ length: 25 }, (_, i) =>
    done.has(denverDay(new Date(Date.now() - (24 - i) * DAY_MS)))
  );

  return { ...h, history, completedToday, streak, rate: Math.round((done30 / 30) * 100), pct: done30 / 30, heatmap };
}

// Refresh derived fields (a new day flips completedToday/streak even with no writes)
export function recomputeAllHabits(): void {
  if (_state.habits.length === 0) return;
  setState({ habits: _state.habits.map(recomputeHabit) });
}

export function addHabit(name: string, cadence: string): Habit {
  const habit = recomputeHabit({
    id: `hb-${Date.now()}`,
    name,
    cadence: cadence || 'Daily',
    streak: 0, rate: 0, pct: 0, completedToday: false, heatmap: [],
    history: [],
  });
  setState({ habits: [..._state.habits, habit] });
  return habit;
}

export function deleteHabit(id: string): void {
  setState({ habits: _state.habits.filter((h) => h.id !== id) });
}

export function toggleHabitToday(id: string): void {
  const today = denverDay();
  setState({
    habits: _state.habits.map((h) => {
      if (h.id !== id) return h;
      const history = new Set(h.history || []);
      if (history.has(today)) history.delete(today);
      else history.add(today);
      return recomputeHabit({ ...h, history: [...history] });
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

// ── Shopping list ─────────────────────────────────────────────────────────────

export function addShoppingItem(name: string, category: ShoppingCategory, addedBy = USER.firstName): ShoppingItem {
  const item: ShoppingItem = { id: `sh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, category, done: false, addedBy, addedAt: Date.now() };
  setState({ shopping: [..._state.shopping, item] });
  return item;
}

export function toggleShoppingItem(id: string): void {
  setState({ shopping: _state.shopping.map((i) => i.id === id ? { ...i, done: !i.done } : i) });
}

export function deleteShoppingItem(id: string): void {
  setState({ shopping: _state.shopping.filter((i) => i.id !== id) });
}

export function clearBoughtShoppingItems(): void {
  setState({ shopping: _state.shopping.filter((i) => !i.done) });
}
