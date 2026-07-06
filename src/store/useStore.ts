import { create } from 'zustand';
import { sseUrl, API_URL } from '../auth';

// Draft ids with an in-flight send — SSE merges must not revert these to 'ready'.
const _pendingSends = new Map<string, { text: string }>();

export interface Task {
  id: string;
  title: string;
  category: string;
  priority: 'p1' | 'p2' | 'p3';
  done: boolean;
  agentBadge?: string;
  column: 'today' | 'upcoming' | 'done';
  dueDate?: string; // YYYY-MM-DD
}

export interface Comm {
  id: string;
  source: 'email' | 'teams';
  who: string;
  subject: string;
  preview: string;
  time: string;
  priority: 'p1' | 'p2' | 'p3';
  status: 'open' | 'snoozed' | 'dismissed';
}

export interface Draft {
  id: string;
  to: string;
  re: string;
  text: string;
  status: 'ready' | 'sent' | 'discarded';
  commId?: string; // inbox email this replies to (sends in-thread)
  cc?: string;
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
  history?: string[]; // Denver-local YYYY-MM-DD completion dates (server-derived)
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

export type ShoppingCategory = 'Groceries' | 'House' | 'Misc';

export interface ShoppingItem {
  id: string;
  name: string;
  category: ShoppingCategory;
  done: boolean;
  addedBy?: string;
  addedAt?: number;
}

export interface Delegation {
  id: string;
  what: string;
  who: string;
  dueDate?: string;
  sourceCommId?: string;
  sourceQuote?: string;
  status: 'open' | 'nudged' | 'done' | 'slipped';
  createdAt: number;
  updatedAt: number;
}

// One day of Oura Ring data
export interface HealthDay {
  date: string;
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

export interface Contact {
  name: string;
  email: string;
  count: number;
  lastAt: number;
}

export interface CalEvent {
  id: string;
  title: string;
  start: number;   // decimal hour e.g. 9.5 = 9:30am
  duration: number; // decimal hours
  color: string;
  category: string;
  date: number; // day of month
  month?: number;
  year?: number;
  source?: 'work' | 'personal';
  allDay?: boolean;
}

export function makeHeatmap(rate: number, name: string): boolean[] {
  return Array.from({ length: 25 }, (_, i) => {
    return (i * 7 + name.charCodeAt(0)) % 10 < rate / 10;
  });
}


export interface DayBlock {
  id: string;
  start: number;
  duration: number;
  kind: 'email' | 'deep-work' | 'meeting' | 'habit' | 'exercise' | 'creative' | 'personal' | 'break';
  title: string;
  note?: string;
  taskIds?: string[];
  commIds?: string[];
  habitId?: string;
  bookTo?: 'work' | 'personal' | 'none';
  bookedEventId?: string;
}

export interface DayPlan {
  date: string;
  status: 'draft' | 'confirmed';
  blocks: DayBlock[];
  updatedAt: number;
}

interface StoreState {
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
  delegations: Delegation[];
  calNote: string;
  briefingText: string;
  briefingNudges: string[];
  userProfile: string;
  assistantName: string;
  dayPlan: DayPlan | null;
  contacts: Contact[];
  // One-shot handoff: which email the Inbox should expand on next visit
  inboxFocusCommId: string | null;
  userName: string;
  toast: { kind: 'error' | 'ok'; msg: string } | null;
  sseConnected: boolean;

  acceptAction: (id: string) => void;
  dismissAction: (id: string) => void;
  sendDraft: (id: string) => void;
  discardDraft: (id: string) => void;
  undoDiscardDraft: (id: string) => void;
  updateDraftText: (id: string, text: string) => void;
  saveDraftText: (id: string, text: string) => void;
  snoozeComm: (id: string) => void;
  dismissComm: (id: string) => void;
  addTodoFromComm: (id: string) => void;
  toggleTask: (id: string) => void;
  addTask: (task: Task) => void;
  moveTask: (id: string, column: 'today' | 'upcoming' | 'done') => void;
  editTask: (id: string, updates: Partial<Pick<Task, 'title' | 'priority' | 'category' | 'dueDate'>>) => void;
  deleteTask: (id: string) => void;

  toggleHabitToday: (id: string) => void;
  updateGoalProgress: (id: string, pct: number) => void;
  addGoal: (name: string, target: string, deadline: string, color: string) => void;
  editGoal: (id: string, updates: Partial<Goal>) => void;
  updateBookProgress: (id: string, pct: number) => void;
  addBook: (title: string, author: string) => void;
  reorderBook: (id: string, direction: 'up' | 'down') => void;
  startReading: (id: string) => void;
  addIdea: (title: string, body: string, tags: string[]) => void;
  addJournalEntry: (text: string) => void;
  addCalEvent: (event: Omit<CalEvent, 'id'>) => void;
  updateCalNote: (text: string) => void;
}

export const useStore = create<StoreState>((set) => ({
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
  delegations: [],
  calNote: '',
  briefingText: '',
  briefingNudges: [],
  userProfile: '',
  assistantName: 'Adler',
  dayPlan: null,
  contacts: [],
  inboxFocusCommId: null,
  userName: '',
  toast: null,
  sseConnected: true,

  acceptAction: (id) => {
    const action = useStore.getState().proposedActions.find((a) => a.id === id);
    if (!action) return;
    let newTask: Task | null = null;
    if (action.kind === 'todo') {
      newTask = {
        id: `t-${Date.now()}`,
        title: action.text.replace('Add to-do: ', ''),
        category: 'Work',
        priority: action.priority ?? 'p2',
        done: false,
        agentBadge: 'From inbox',
        column: 'today',
      };
    }
    set((state) => ({
      tasks: newTask ? [...state.tasks, newTask!] : state.tasks,
      proposedActions: state.proposedActions.map((a) =>
        a.id === id ? { ...a, status: 'accepted' } : a
      ),
    }));
    if (newTask) {
      const API = import.meta.env.VITE_API_URL || '';
      fetch(`${API}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      }).catch(() => {});
    }
  },

  dismissAction: (id) =>
    set((state) => ({
      proposedActions: state.proposedActions.map((a) =>
        a.id === id ? { ...a, status: 'dismissed' } : a
      ),
    })),

  sendDraft: (id) => {
    // Send the exact text on screen (avoids sending a pre-edit stored copy).
    const current = useStore.getState().drafts.find((d) => d.id === id);
    // Track the in-flight send so an SSE broadcast racing this request can't
    // resurrect the draft as 'ready' with stale text mid-send.
    _pendingSends.set(id, { text: current?.text || '' });
    // Optimistically mark sent; server call will confirm or we revert on error
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === id ? { ...d, status: 'sent' } : d)),
    }));
    fetch(`${API_URL}/api/drafts/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: id, text: current?.text }),
      signal: AbortSignal.timeout(45_000),
    }).then(async (res) => {
      _pendingSends.delete(id);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Send failed' }));
        set((state) => ({ drafts: state.drafts.map((d) => (d.id === id ? { ...d, status: 'ready' } : d)) }));
        notifyError(`Could not send: ${err.error || 'try again'}`);
      } else {
        notifyOk('Reply sent');
      }
    }).catch(() => {
      _pendingSends.delete(id);
      set((state) => ({ drafts: state.drafts.map((d) => (d.id === id ? { ...d, status: 'ready' } : d)) }));
      notifyError('Could not send — check your connection or try again');
    });
  },

  discardDraft: (id) => {
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === id ? { ...d, status: 'discarded' } : d)),
    }));
    fetch(`${API_URL}/api/drafts/${id}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'discarded' }),
    }).catch(() => {});
  },

  undoDiscardDraft: (id) => {
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === id ? { ...d, status: 'ready' } : d)),
    }));
    fetch(`${API_URL}/api/drafts/${id}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ready' }),
    }).catch(() => {});
  },

  updateDraftText: (id, text) =>
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === id ? { ...d, text } : d)),
    })),

  saveDraftText: (id, text) => {
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === id ? { ...d, text } : d)),
    }));
    const API = import.meta.env.VITE_API_URL || '';
    fetch(`${API}/api/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => {});
  },

  snoozeComm: (id) => {
    set((state) => ({
      comms: state.comms.map((c) => (c.id === id ? { ...c, status: 'snoozed' } : c)),
    }));
    const API = import.meta.env.VITE_API_URL || '';
    fetch(`${API}/api/comms/${encodeURIComponent(id)}/snooze`, { method: 'POST' }).catch(() => {});
  },

  dismissComm: (id) => {
    set((state) => ({
      comms: state.comms.map((c) => (c.id === id ? { ...c, status: 'dismissed' } : c)),
    }));
    const API = import.meta.env.VITE_API_URL || '';
    fetch(`${API}/api/comms/${encodeURIComponent(id)}/dismiss`, { method: 'POST' }).catch(() => {});
  },

  addTodoFromComm: (id) => {
    const comm = useStore.getState().comms.find((c) => c.id === id);
    if (!comm) return;
    const newTask: Task = {
      id: `t-${Date.now()}`,
      title: `Reply to ${comm.who}: ${comm.subject}`,
      category: 'Work',
      priority: comm.priority,
      done: false,
      agentBadge: 'From inbox',
      column: 'today' as const,
    };
    set((state) => ({
      tasks: [...state.tasks, newTask],
      comms: state.comms.map((c) => (c.id === id ? { ...c, status: 'snoozed' } : c)),
    }));
    const API = import.meta.env.VITE_API_URL || '';
    fetch(`${API}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask),
    }).catch(() => {});
  },

  toggleTask: (id) => {
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== id) return t;
        if (t.column === 'today') return { ...t, done: true, column: 'done' as const };
        if (t.column === 'done') return { ...t, done: false, column: 'today' as const };
        return t;
      }),
    }));
    const API = import.meta.env.VITE_API_URL || '';
    const task = useStore.getState().tasks.find((t) => t.id === id);
    if (task) {
      fetch(`${API}/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: task.done, column: task.column }),
      }).catch(() => {});
    }
  },

  addTask: (task) => {
    set((state) => ({ tasks: [...state.tasks, task] }));
    const API = import.meta.env.VITE_API_URL || '';
    fetch(`${API}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    }).catch(() => {});
  },

  moveTask: (id, column) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, column, done: column === 'done' } : t
      ),
    }));
    const API = import.meta.env.VITE_API_URL || '';
    fetch(`${API}/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column, done: column === 'done' }),
    }).catch(() => {});
  },

  editTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) => t.id === id ? { ...t, ...updates } : t),
    }));
    const API = import.meta.env.VITE_API_URL || '';
    fetch(`${API}/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(() => {});
  },

  deleteTask: (id) => {
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
    const API = import.meta.env.VITE_API_URL || '';
    fetch(`${API}/api/tasks/${id}`, { method: 'DELETE' }).catch(() => {});
  },

  // Server-authoritative: optimistic flip locally, real recompute arrives via SSE
  toggleHabitToday: (id) => {
    set((state) => ({
      habits: state.habits.map((h) =>
        h.id === id ? { ...h, completedToday: !h.completedToday } : h
      ),
    }));
    const API = import.meta.env.VITE_API_URL || '';
    fetch(`${API}/api/habits/${id}/toggle`, { method: 'POST' }).catch(() => {});
  },

  addGoal: (name, target, deadline, color) => {
    const yr = `'${String(new Date().getFullYear()).slice(2)}`;
    set((state) => ({
      goals: [
        ...state.goals,
        { id: `g-${Date.now()}`, name, pct: 0, current: '0', target, deadline, deadlineShort: deadline.slice(0, 3) + yr, tasks: 0, color },
      ],
    }));
    persistCollection('goals', useStore.getState().goals);
  },

  editGoal: (id, updates) => {
    set((state) => ({ goals: state.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)) }));
    persistCollection('goals', useStore.getState().goals);
  },

  updateGoalProgress: (id, pct) => {
    set((state) => ({ goals: state.goals.map((g) => (g.id === id ? { ...g, pct: Math.max(0, Math.min(100, pct)) } : g)) }));
    persistCollection('goals', useStore.getState().goals);
  },

  updateBookProgress: (id, pct) => {
    set((state) => ({ books: state.books.map((b) => b.id === id ? { ...b, pct: Math.max(0, Math.min(100, pct)) } : b) }));
    persistCollection('books', useStore.getState().books);
  },

  addBook: (title, author) => {
    set((state) => ({
      books: [
        ...state.books,
        { id: `b-${Date.now()}`, title, author, pct: 0, chapter: '', status: 'queue' as const, gradient: 'linear-gradient(135deg, oklch(0.6 0.08 200), oklch(0.75 0.06 200))' },
      ],
    }));
    persistCollection('books', useStore.getState().books);
  },

  reorderBook: (id, direction) => {
    set((state) => {
      const queueBooks = state.books.filter((b) => b.status === 'queue');
      const idx = queueBooks.findIndex((b) => b.id === id);
      if (idx === -1) return state;
      const newQueue = [...queueBooks];
      if (direction === 'up' && idx > 0) {
        [newQueue[idx - 1], newQueue[idx]] = [newQueue[idx], newQueue[idx - 1]];
      } else if (direction === 'down' && idx < newQueue.length - 1) {
        [newQueue[idx], newQueue[idx + 1]] = [newQueue[idx + 1], newQueue[idx]];
      } else {
        return state;
      }
      const nonQueueBooks = state.books.filter((b) => b.status !== 'queue');
      return { books: [...nonQueueBooks, ...newQueue] };
    });
    persistCollection('books', useStore.getState().books);
  },

  startReading: (id) => {
    set((state) => ({ books: state.books.map((b) => b.id === id ? { ...b, status: 'reading' as const, chapter: 'ch. 1' } : b) }));
    persistCollection('books', useStore.getState().books);
  },

  addIdea: (title, body, tags) => {
    set((state) => {
      const colors = ['var(--blue)', 'var(--accent)', 'var(--violet)', 'var(--warm)', 'var(--p2)'];
      const color = colors[state.ideas.length % colors.length];
      return { ideas: [{ id: `i-${Date.now()}`, title, body, tags, color }, ...state.ideas] };
    });
    persistCollection('ideas', useStore.getState().ideas);
  },

  addJournalEntry: (text) => {
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    set((state) => ({ journalEntries: [{ id: `j-${Date.now()}`, date, text }, ...state.journalEntries] }));
    persistCollection('journalEntries', useStore.getState().journalEntries);
  },

  addCalEvent: (event) => {
    set((state) => ({ calEvents: [...state.calEvents, { ...event, id: `ce-${Date.now()}` }] }));
    persistCollection('calEvents', useStore.getState().calEvents);
  },

  updateCalNote: (text) => {
    set(() => ({ calNote: text }));
    fetch(`${API_URL}/api/state`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calNote: text }),
    }).then((r) => { if (!r.ok) throw 0; }).catch(() => notifyError('Could not save note'));
  },
}));

// ── Error surface (T15): show failures instead of swallowing them ────────────────
export function notifyError(msg: string) { useStore.setState({ toast: { kind: 'error', msg } }); }
export function notifyOk(msg: string) { useStore.setState({ toast: { kind: 'ok', msg } }); }

// Persist a user-authored collection; surface failures rather than losing data silently.
async function persistCollection(name: 'goals' | 'books' | 'ideas' | 'journalEntries' | 'calEvents', items: unknown[]) {
  try {
    const res = await fetch(`${API_URL}/api/collection/${name}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    notifyError('Could not save — check your connection and try again');
  }
}

export async function askAgent(message: string, agentHint?: string) {
  const res = await fetch(`${API_URL}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, agentHint }),
  })
  return res.json() as Promise<{ text: string; actions: any[]; agent: string }>
}

export async function addHabit(name: string, cadence: string) {
  const API = import.meta.env.VITE_API_URL || '';
  await fetch(`${API}/api/habits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, cadence }),
  }).catch(() => {});
}

export async function deleteHabit(id: string) {
  const API = import.meta.env.VITE_API_URL || '';
  await fetch(`${API}/api/habits/${id}`, { method: 'DELETE' }).catch(() => {});
}

export async function addShoppingItem(name: string, category: string) {
  const API = import.meta.env.VITE_API_URL || '';
  await fetch(`${API}/api/shopping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category }),
  }).catch(() => {});
}

export async function toggleShoppingItem(id: string) {
  useStore.setState((s) => ({ shopping: s.shopping.map((i) => i.id === id ? { ...i, done: !i.done } : i) }));
  const API = import.meta.env.VITE_API_URL || '';
  await fetch(`${API}/api/shopping/${id}/toggle`, { method: 'POST' }).catch(() => {});
}

export async function deleteShoppingItem(id: string) {
  useStore.setState((s) => ({ shopping: s.shopping.filter((i) => i.id !== id) }));
  const API = import.meta.env.VITE_API_URL || '';
  await fetch(`${API}/api/shopping/${id}`, { method: 'DELETE' }).catch(() => {});
}

export async function clearBoughtShopping() {
  useStore.setState((s) => ({ shopping: s.shopping.filter((i) => !i.done) }));
  const API = import.meta.env.VITE_API_URL || '';
  await fetch(`${API}/api/shopping/clear-bought`, { method: 'POST' }).catch(() => {});
}

export async function addDelegation(what: string, who: string, dueDate?: string) {
  const API = import.meta.env.VITE_API_URL || '';
  await fetch(`${API}/api/delegations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ what, who, dueDate }),
  }).catch(() => {});
}

export async function delegationStatus(id: string, status: 'open' | 'nudged' | 'done' | 'slipped') {
  useStore.setState((s) => ({ delegations: s.delegations.map((d) => d.id === id ? { ...d, status } : d) }));
  const API = import.meta.env.VITE_API_URL || '';
  await fetch(`${API}/api/delegations/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }).catch(() => {});
}

export async function deleteDelegation(id: string) {
  useStore.setState((s) => ({ delegations: s.delegations.filter((d) => d.id !== id) }));
  const API = import.meta.env.VITE_API_URL || '';
  await fetch(`${API}/api/delegations/${id}`, { method: 'DELETE' }).catch(() => {});
}

export async function syncStateToServer() {
  const state = useStore.getState()
  await fetch(`${API_URL}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state)
  }).catch(() => {})
}

function sanitizeServerState(s: Record<string, unknown>) {
  const arr = (v: unknown, fallback: unknown[] = []) => Array.isArray(v) ? v : fallback;
  return {
    ...s,
    tasks: arr(s.tasks),
    comms: arr(s.comms),
    drafts: arr(s.drafts).map((d) => {
      const dd = d as { id: string; status: string; text: string };
      const pending = _pendingSends.get(dd.id);
      // Mid-send: keep the on-screen text and 'sent' status until the request settles
      return pending ? { ...dd, status: 'sent', text: pending.text } : d;
    }),
    proposedActions: arr(s.proposedActions),
    habits: arr(s.habits),
    goals: arr(s.goals),
    books: arr(s.books),
    highlights: arr(s.highlights),
    ideas: arr(s.ideas),
    journalEntries: arr(s.journalEntries),
    calEvents: arr(s.calEvents),
    health: arr(s.health),
    shopping: arr(s.shopping),
    delegations: arr(s.delegations),
    briefingNudges: arr(s.briefingNudges),
  };
}

export async function initFromServer() {
  try {
    const res = await fetch(`${API_URL}/api/state`)
    if (!res.ok) return
    const serverState = await res.json()
    useStore.setState(sanitizeServerState(serverState))
  } catch {}
  try {
    const res = await fetch(`${API_URL}/api/setup/status`)
    if (!res.ok) return
    const status = await res.json()
    if (typeof status.assistant === 'string' && status.assistant.trim()) {
      useStore.setState({ assistantName: status.assistant.trim() })
    }
    if (typeof status.user === 'string' && status.user.trim()) {
      useStore.setState({ userName: status.user.trim().split(' ')[0] })
    }
  } catch {}
}

// A draft the user is actively editing must not be clobbered by an SSE push.
let _editingDraftId: string | null = null
export function setEditingDraft(id: string | null) { _editingDraftId = id }

export function subscribeToServerEvents(onStatus?: (connected: boolean) => void) {
  const es = new EventSource(sseUrl(`${API_URL}/api/events`), { withCredentials: true })
  es.onopen = () => onStatus?.(true)
  es.onerror = () => onStatus?.(false)
  es.onmessage = (e) => {
    try {
      const serverState = sanitizeServerState(JSON.parse(e.data))
      const local = useStore.getState()
      // Preserve the draft currently being edited so incoming pushes don't wipe keystrokes.
      if (_editingDraftId) {
        const mine = local.drafts.find((d) => d.id === _editingDraftId)
        if (mine) {
          serverState.drafts = (serverState.drafts as Draft[]).map((d) => d.id === _editingDraftId ? mine : d)
          if (!serverState.drafts.some((d: Draft) => d.id === _editingDraftId)) serverState.drafts.push(mine)
        }
      }
      // assistantName is client-derived from setup status, not part of the state stream.
      useStore.setState({ ...serverState, assistantName: local.assistantName })
    } catch {}
  }
  return () => es.close()
}
