import { create } from 'zustand';

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

export interface CalEvent {
  id: string;
  title: string;
  start: number;   // decimal hour e.g. 9.5 = 9:30am
  duration: number; // decimal hours
  color: string;
  category: string;
  date: number; // day of month (June 2026), default 29
}

export function makeHeatmap(rate: number, name: string): boolean[] {
  return Array.from({ length: 25 }, (_, i) => {
    return (i * 7 + name.charCodeAt(0)) % 10 < rate / 10;
  });
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
  calNote: string;
  briefingText: string;
  briefingNudges: string[];
  userProfile: string;

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
  draftReplyForComm: (commId: string) => void;
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
  calNote: '',
  briefingText: '',
  briefingNudges: [],
  userProfile: '',

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
    // Optimistically mark sent; server call will confirm or we revert on error
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === id ? { ...d, status: 'sent' } : d)),
    }));
    const API = import.meta.env.VITE_API_URL || '';
    fetch(`${API}/api/drafts/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: id }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Send failed' }));
        // Revert to ready so user can retry
        set((state) => ({
          drafts: state.drafts.map((d) => (d.id === id ? { ...d, status: 'ready' } : d)),
        }));
        console.error('Draft send failed:', err.error);
      }
    }).catch(() => {
      set((state) => ({
        drafts: state.drafts.map((d) => (d.id === id ? { ...d, status: 'ready' } : d)),
      }));
    });
  },

  discardDraft: (id) =>
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === id ? { ...d, status: 'discarded' } : d)),
    })),

  undoDiscardDraft: (id) =>
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === id ? { ...d, status: 'ready' } : d)),
    })),

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

  updateGoalProgress: (id, pct) =>
    set((state) => ({
      goals: state.goals.map((g) =>
        g.id === id ? { ...g, pct: Math.max(0, Math.min(100, pct)) } : g
      ),
    })),

  addGoal: (name, target, deadline, color) =>
    set((state) => ({
      goals: [
        ...state.goals,
        {
          id: `g-${Date.now()}`,
          name,
          pct: 0,
          current: '0',
          target,
          deadline,
          deadlineShort: deadline.slice(0, 3) + "'26",
          tasks: 0,
          color,
        },
      ],
    })),

  editGoal: (id, updates) =>
    set((state) => ({
      goals: state.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    })),

  updateBookProgress: (id, pct) =>
    set((state) => ({
      books: state.books.map((b) =>
        b.id === id ? { ...b, pct: Math.max(0, Math.min(100, pct)) } : b
      ),
    })),

  addBook: (title, author) =>
    set((state) => ({
      books: [
        ...state.books,
        {
          id: `b-${Date.now()}`,
          title,
          author,
          pct: 0,
          chapter: '',
          status: 'queue' as const,
          gradient: 'linear-gradient(135deg, oklch(0.6 0.08 200), oklch(0.75 0.06 200))',
        },
      ],
    })),

  reorderBook: (id, direction) =>
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
    }),

  startReading: (id) =>
    set((state) => ({
      books: state.books.map((b) =>
        b.id === id ? { ...b, status: 'reading' as const, chapter: 'ch. 1' } : b
      ),
    })),

  addIdea: (title, body, tags) =>
    set((state) => {
      const colors = ['var(--blue)', 'var(--accent)', 'var(--violet)', 'var(--warm)', 'var(--p2)'];
      const color = colors[state.ideas.length % colors.length];
      return {
        ideas: [
          { id: `i-${Date.now()}`, title, body, tags, color },
          ...state.ideas,
        ],
      };
    }),

  addJournalEntry: (text) =>
    set((state) => ({
      journalEntries: [
        { id: `j-${Date.now()}`, date: 'Jun 29, 2026', text },
        ...state.journalEntries,
      ],
    })),

  draftReplyForComm: (commId) =>
    set((state) => {
      const comm = state.comms.find((c) => c.id === commId);
      if (!comm) return state;
      const firstName = comm.who.split(' ')[0];
      return {
        drafts: [
          ...state.drafts,
          {
            id: Date.now().toString(),
            to: comm.who,
            re: comm.subject,
            text: `Hi ${firstName}, thanks for reaching out. I'll get back to you shortly. — Jeff`,
            status: 'ready' as const,
          },
        ],
      };
    }),

  addCalEvent: (event) =>
    set((state) => ({
      calEvents: [
        ...state.calEvents,
        { ...event, id: `ce-${Date.now()}` },
      ],
    })),

  updateCalNote: (text) =>
    set(() => ({ calNote: text })),
}));

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

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
    drafts: arr(s.drafts),
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
}

export function subscribeToServerEvents() {
  const es = new EventSource(`${API_URL}/api/events`)
  es.onmessage = (e) => {
    try {
      const serverState = JSON.parse(e.data)
      useStore.setState(sanitizeServerState(serverState))
    } catch {}
  }
  return () => es.close()
}
