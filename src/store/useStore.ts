import { create } from 'zustand';

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
  start: number;   // decimal hour e.g. 9.5 = 9:30am
  duration: number; // decimal hours
  color: string;
  category: string;
  date: number; // day of month (June 2026), default 29
}

function makeHeatmap(rate: number, name: string): boolean[] {
  return Array.from({ length: 25 }, (_, i) => {
    return (i * 7 + name.charCodeAt(0)) % 10 < rate / 10;
  });
}

const seedHabits: Habit[] = [
  { id: 'h1', name: 'Morning run', cadence: 'Daily · 6am', streak: 12, rate: 80, pct: 0.6, completedToday: false, heatmap: makeHeatmap(80, 'Morning run') },
  { id: 'h2', name: 'Meditate 10 min', cadence: 'Daily · 7am', streak: 5, rate: 67, pct: 0.67, completedToday: false, heatmap: makeHeatmap(67, 'Meditate 10 min') },
  { id: 'h3', name: 'Read 30 min', cadence: 'Daily · 9pm', streak: 21, rate: 90, pct: 0.90, completedToday: false, heatmap: makeHeatmap(90, 'Read 30 min') },
  { id: 'h4', name: 'Workout', cadence: '3x/week', streak: 2, rate: 85, pct: 0.85, completedToday: false, heatmap: makeHeatmap(85, 'Workout') },
  { id: 'h5', name: 'No alcohol', cadence: 'Daily', streak: 8, rate: 73, pct: 0.73, completedToday: false, heatmap: makeHeatmap(73, 'No alcohol') },
];

const seedGoals: Goal[] = [
  { id: 'g1', name: 'Run 500 miles', pct: 38, current: '190 mi', target: '500 mi', deadline: 'Dec 31, 2026', deadlineShort: "Dec '26", tasks: 2, color: 'var(--p1)' },
  { id: 'g2', name: 'Read 24 books', pct: 54, current: '13 books', target: '24 books', deadline: 'Dec 31, 2026', deadlineShort: "Dec '26", tasks: 1, color: 'var(--blue)' },
  { id: 'g3', name: 'Save $20,000', pct: 61, current: '$12,200', target: '$20,000', deadline: 'Dec 31, 2026', deadlineShort: "Dec '26", tasks: 3, color: 'var(--accent)' },
  { id: 'g4', name: 'Launch side project', pct: 25, current: '3 of 12 milestones', target: '12 milestones', deadline: 'Sep 30, 2026', deadlineShort: "Sep '26", tasks: 4, color: 'var(--violet)' },
];

const seedBooks: Book[] = [
  {
    id: 'b1', title: 'The Creative Act', author: 'Rick Rubin', pct: 68, chapter: 'ch. 14 of 21', status: 'reading',
    gradient: 'repeating-linear-gradient(135deg, oklch(0.58 0.12 245) 0, oklch(0.58 0.12 245) 6px, oklch(0.7 0.08 245) 6px, oklch(0.7 0.08 245) 12px)',
  },
  {
    id: 'b2', title: 'Shape Up', author: 'Ryan Singer', pct: 34, chapter: 'ch. 6 of 18', status: 'reading',
    gradient: 'repeating-linear-gradient(135deg, oklch(0.55 0.13 162) 0, oklch(0.55 0.13 162) 6px, oklch(0.7 0.09 162) 6px, oklch(0.7 0.09 162) 12px)',
  },
  { id: 'b3', title: 'Thinking, Fast and Slow', author: 'Kahneman', pct: 0, chapter: '', status: 'queue', gradient: 'linear-gradient(135deg, oklch(0.6 0.1 27), oklch(0.7 0.08 27))' },
  { id: 'b4', title: 'A Pattern Language', author: 'Alexander', pct: 0, chapter: '', status: 'queue', gradient: 'linear-gradient(135deg, oklch(0.6 0.1 200), oklch(0.7 0.08 200))' },
  { id: 'b5', title: 'The Mom Test', author: 'Rob Fitzpatrick', pct: 0, chapter: '', status: 'queue', gradient: 'linear-gradient(135deg, oklch(0.6 0.1 75), oklch(0.7 0.08 75))' },
  { id: 'b6', title: 'Dune', author: 'Frank Herbert', pct: 0, chapter: '', status: 'queue', gradient: 'linear-gradient(135deg, oklch(0.6 0.1 50), oklch(0.7 0.08 50))' },
  { id: 'b7', title: 'Staff Engineer', author: 'Will Larson', pct: 0, chapter: '', status: 'queue', gradient: 'linear-gradient(135deg, oklch(0.6 0.1 280), oklch(0.7 0.08 280))' },
];

const seedHighlights: Highlight[] = [
  { id: 'hl1', quote: 'The work wants to be made, and it wants to be made through you.', source: 'The Creative Act, p. 47' },
  { id: 'hl2', quote: 'Creativity is not a talent. It is a way of operating.', source: 'The Creative Act, p. 83' },
  { id: 'hl3', quote: "You can't learn what people think of an idea just by asking them.", source: 'The Mom Test, p. 12' },
  { id: 'hl4', quote: 'Shaping is the key creative leap... done by a small group away from distractions.', source: 'Shape Up, p. 8' },
];

const seedIdeas: Idea[] = [
  { id: 'i1', title: 'Atlas plugin system', body: 'Allow users to build custom widgets and data sources. Need a plugin manifest format and sandbox.', tags: ['dev', 'product'], color: 'var(--blue)' },
  { id: 'i2', title: 'Weekly review template', body: 'A structured 30-min Sunday template for reflection, goal check-in, and next-week planning.', tags: ['productivity'], color: 'var(--accent)' },
  { id: 'i3', title: 'Offline-first architecture', body: 'All data local, sync in background. Need conflict resolution strategy for multi-device.', tags: ['dev', 'architecture'], color: 'var(--violet)' },
  { id: 'i4', title: 'Habit-goal linking', body: 'Auto-suggest linking habits to goals. Morning run → Run 500mi goal.', tags: ['product', 'ux'], color: 'var(--warm)' },
  { id: 'i5', title: 'Reading club feature', body: 'Share highlights with friends, discuss books. Private groups, weekly picks.', tags: ['social', 'reading'], color: 'var(--p2)' },
];

const seedJournalEntries: JournalEntry[] = [
  {
    id: 'j1',
    date: 'Jun 29, 2026',
    text: "Today felt productive despite the morning chaos. The Q2 review prep is hanging over me, but the focus block Scout added actually helped — got 60% of the slides done before lunch. Had a good conversation with Sarah about the server issues; feels resolved now.\n\nNeed to think more carefully about how I'm prioritizing. Three P1 tasks sitting in my inbox is a sign I've been avoiding hard conversations...",
  },
];

const seedTasks: Task[] = [
  { id: 't1', title: 'Email the accountant', category: 'Work', priority: 'p1', done: false, column: 'today' },
  { id: 't2', title: 'Review Q2 budget', category: 'Work', priority: 'p2', done: false, column: 'today' },
  { id: 't3', title: 'Book dentist follow-up', category: 'Health', priority: 'p1', done: false, agentBadge: 'From inbox', column: 'today' },
  { id: 't4', title: 'Finish presentation slides', category: 'Work', priority: 'p2', done: false, column: 'today' },
  { id: 't5', title: 'Call mom', category: 'Personal', priority: 'p3', done: false, column: 'upcoming' },
  { id: 't6', title: 'Renew gym membership', category: 'Health', priority: 'p3', done: false, column: 'upcoming' },
  { id: 't7', title: 'Draft blog post', category: 'Personal', priority: 'p3', done: false, column: 'upcoming' },
  { id: 't8', title: 'Submit expense report', category: 'Work', priority: 'p2', done: true, column: 'done' },
];

const seedComms: Comm[] = [
  { id: 'c1', source: 'email', who: 'Mark Johnson', subject: 'Re: Q2 budget review', preview: 'Need your sign-off by EOD', time: '8:15am', priority: 'p1', status: 'open' },
  { id: 'c2', source: 'teams', who: 'Sarah Chen', subject: 'Urgent: server issue in prod', preview: 'The API is throwing 500s', time: '7:52am', priority: 'p1', status: 'open' },
  { id: 'c3', source: 'email', who: 'Lisa Park', subject: 'Following up on proposal', preview: "Haven't heard back...", time: '9:30am', priority: 'p2', status: 'open' },
  { id: 'c4', source: 'email', who: 'David Kim', subject: 'Team lunch this Friday', preview: 'Can you make it?', time: '10:45am', priority: 'p2', status: 'open' },
  { id: 'c5', source: 'teams', who: 'Mike Torres', subject: 'Design review tomorrow', preview: 'Are we still on?', time: '11:20am', priority: 'p2', status: 'open' },
  { id: 'c6', source: 'email', who: 'Newsletter', subject: 'Your weekly digest', preview: 'Top stories this week...', time: '6:00am', priority: 'p3', status: 'open' },
  { id: 'c7', source: 'email', who: 'GitHub', subject: 'PR review requested', preview: 'alexchen opened a PR', time: '8:45am', priority: 'p3', status: 'open' },
  { id: 'c8', source: 'teams', who: 'Tom Wilson', subject: 'Coffee chat?', preview: 'Free sometime next week?', time: '2:30pm', priority: 'p3', status: 'open' },
];

const seedDrafts: Draft[] = [
  {
    id: 'd1',
    to: 'Mark Johnson',
    re: 'Q2 Budget',
    text: "Hi Mark, I've reviewed the Q2 numbers. The variance in Q3 projections looks reasonable given the market conditions. I'll sign off — can you send the final doc for my records? Thanks, Alex",
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
];

const seedProposedActions: ProposedAction[] = [
  { id: 'a1', kind: 'todo', icon: '✓', text: 'Add to-do: prepare Q2 talking points', meta: 'for 3pm meeting · P2', priority: 'p2', status: 'pending' },
  { id: 'a2', kind: 'cal', icon: '◷', text: 'Hold 90min focus block: finish slides', meta: 'Tomorrow 10–11:30am', status: 'pending' },
  { id: 'a3', kind: 'decline', icon: '✕', text: "Decline: 'All-hands sync' (conflicts with focus block)", meta: 'Wed 2pm', status: 'pending' },
  { id: 'a4', kind: 'todo', icon: '✓', text: 'Add to-do: follow up with Lisa by Thursday', meta: 'P2 · From email', priority: 'p2', status: 'pending' },
  { id: 'a5', kind: 'cal', icon: '◷', text: 'Add travel buffer: 30min before 3pm Q2 Review', meta: '2:30pm buffer', status: 'pending' },
];

const seedCalEvents: CalEvent[] = [
  { id: 'ce1', title: 'Team standup', start: 9, duration: 0.5, color: 'var(--blue)', category: 'Work', date: 29 },
  { id: 'ce2', title: 'Focus block — slides', start: 11, duration: 1.5, color: 'var(--violet)', category: 'Focus', date: 29 },
  { id: 'ce3', title: 'Lunch with Sarah', start: 13, duration: 1, color: 'var(--warm)', category: 'Personal', date: 29 },
  { id: 'ce4', title: 'Q2 Review', start: 15, duration: 1, color: 'var(--blue)', category: 'Work', date: 29 },
  { id: 'ce5', title: 'Gym', start: 17.5, duration: 1, color: 'var(--accent)', category: 'Health', date: 29 },
];

const seedCalNote = 'Prep Q2 talking points before 3pm\nSend budget sign-off to Mark\nBlock time for blog post this week';

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
  calNote: string;

  acceptAction: (id: string) => void;
  dismissAction: (id: string) => void;
  sendDraft: (id: string) => void;
  discardDraft: (id: string) => void;
  undoDiscardDraft: (id: string) => void;
  updateDraftText: (id: string, text: string) => void;
  snoozeComm: (id: string) => void;
  addTodoFromComm: (id: string) => void;
  toggleTask: (id: string) => void;
  addTask: (task: Task) => void;
  moveTask: (id: string, column: 'today' | 'upcoming' | 'done') => void;
  editTask: (id: string, updates: Partial<Pick<Task, 'title' | 'priority' | 'category'>>) => void;
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
  tasks: seedTasks,
  comms: seedComms,
  drafts: seedDrafts,
  proposedActions: seedProposedActions,
  habits: seedHabits,
  goals: seedGoals,
  books: seedBooks,
  highlights: seedHighlights,
  ideas: seedIdeas,
  journalEntries: seedJournalEntries,
  calEvents: seedCalEvents,
  calNote: seedCalNote,

  acceptAction: (id) =>
    set((state) => {
      const action = state.proposedActions.find((a) => a.id === id);
      if (!action) return state;
      const newTasks = [...state.tasks];
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
      return {
        tasks: newTasks,
        proposedActions: state.proposedActions.map((a) =>
          a.id === id ? { ...a, status: 'accepted' } : a
        ),
      };
    }),

  dismissAction: (id) =>
    set((state) => ({
      proposedActions: state.proposedActions.map((a) =>
        a.id === id ? { ...a, status: 'dismissed' } : a
      ),
    })),

  sendDraft: (id) =>
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === id ? { ...d, status: 'sent' } : d)),
    })),

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

  snoozeComm: (id) =>
    set((state) => ({
      comms: state.comms.map((c) => (c.id === id ? { ...c, status: 'snoozed' } : c)),
    })),

  addTodoFromComm: (id) =>
    set((state) => {
      const comm = state.comms.find((c) => c.id === id);
      if (!comm) return state;
      return {
        tasks: [
          ...state.tasks,
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
        comms: state.comms.map((c) => (c.id === id ? { ...c, status: 'snoozed' } : c)),
      };
    }),

  toggleTask: (id) =>
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== id) return t;
        if (t.column === 'today') return { ...t, done: true, column: 'done' as const };
        if (t.column === 'done') return { ...t, done: false, column: 'today' as const };
        return t;
      }),
    })),

  addTask: (task) =>
    set((state) => ({ tasks: [...state.tasks, task] })),

  moveTask: (id, column) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, column, done: column === 'done' } : t
      ),
    })),

  editTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => t.id === id ? { ...t, ...updates } : t),
    })),

  deleteTask: (id) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

  toggleHabitToday: (id) =>
    set((state) => ({
      habits: state.habits.map((h) => {
        if (h.id !== id) return h;
        const completing = !h.completedToday;
        const newStreak = completing ? h.streak + 1 : Math.max(0, h.streak - 1);
        const newPct = completing
          ? Math.min(1, h.pct + 1 / 7)
          : Math.max(0, h.pct - 1 / 7);
        return { ...h, completedToday: completing, streak: newStreak, pct: newPct };
      }),
    })),

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
            text: `Hi ${firstName}, thanks for reaching out. I'll get back to you shortly. — Alex`,
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
    body: JSON.stringify({ message, agentHint, state: useStore.getState() })
  })
  return res.json() as Promise<{ text: string; actions: any[]; agent: string }>
}

export async function syncStateToServer() {
  const state = useStore.getState()
  await fetch(`${API_URL}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state)
  }).catch(() => {})
}

export async function initFromServer() {
  try {
    const res = await fetch(`${API_URL}/api/state`)
    if (!res.ok) return
    const serverState = await res.json()
    useStore.setState(serverState)
  } catch {}
}

export function subscribeToServerEvents() {
  const es = new EventSource(`${API_URL}/api/events`)
  es.onmessage = (e) => {
    try {
      const serverState = JSON.parse(e.data)
      useStore.setState(serverState)
    } catch {}
  }
  return () => es.close()
}
