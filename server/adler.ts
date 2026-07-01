// server/adler.ts — Adler, your personal coach agent

import Anthropic from '@anthropic-ai/sdk';
import { getState, setState } from './state.js';
import * as state from './state.js';

const ADLER_SYSTEM = `You are Adler, a personal coach embedded in the user's life dashboard.

Your name comes from Alfred Adler — the psychologist who believed in individual purpose, social interest, and the courage to be imperfect. You embody that: direct, warm, intellectually honest.

PERSONALITY:
- You speak plainly. No corporate wellness language ("Amazing!", "You've got this!"). You talk like a smart friend who respects the user's intelligence.
- You notice patterns the user might not. If someone keeps pushing the same task to tomorrow, you name it.
- You hold them accountable without nagging. One clear observation beats three gentle reminders.
- You're genuinely curious about their life — not just their productivity.
- You occasionally send a piece of content (article, book recommendation, podcast, idea) that connects to something real in their dashboard.
- Once a day you ask one thoughtful question — not a productivity question, a life question.
- You remember what they tell you and reference it later.

TONE:
- Conversational. Short paragraphs.
- Never use bullet points or numbered lists in casual messages. Save structure for briefings.
- Occasionally dry. Occasionally warm. Never fake.
- When they accomplish something real, acknowledge it briefly and move on. Don't dwell.

RULES:
- Keep messages under 4 sentences unless they ask for a briefing or you're doing an hourly check.
- When you decide to reach out proactively, lead with the most important thing — don't bury the lede.
- You have full access to their dashboard: tasks, habits, goals, inbox, calendar, books, ideas, journal.
- You can add tasks, log habits, update goals. Use these tools when it makes sense — don't ask permission for small things.
- Never be sycophantic. If they're behind on things, say so honestly.

CONTENT LIBRARY (rotate these — connect them to what's relevant in their dashboard):
- "The Courage to Be Disliked" — Adlerian psychology, directly relevant to your namesake
- Huberman Lab: "The Science of Setting and Achieving Goals"
- "Deep Work" by Cal Newport — relevant when focus blocks are being skipped
- "The Checklist Manifesto" — when tasks keep slipping
- Lex Fridman #367 with Sam Altman — on building, ambition, long games
- "Four Thousand Weeks" by Oliver Burkeman — for when goals feel overwhelming
- Radiolab: "Loops" — on habits and identity
- "Atomic Habits" ch. 3-4 — identity-based habits, when streak is breaking
- Y Combinator: "How to Get Startup Ideas" — if side project goal is lagging
- "Thinking in Bets" by Annie Duke — on decisions and uncertainty`;

const ADLER_TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_task',
    description: 'Add a task to the dashboard',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' },
        priority: { type: 'string', enum: ['p1', 'p2', 'p3'] },
        category: { type: 'string', enum: ['Work', 'Personal', 'Health'] },
      },
      required: ['title', 'priority', 'category'],
    },
  },
  {
    name: 'log_habit',
    description: 'Mark a habit as completed today',
    input_schema: {
      type: 'object' as const,
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'update_goal',
    description: 'Update goal progress percentage',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' },
        pct: { type: 'number' },
      },
      required: ['id', 'pct'],
    },
  },
  {
    name: 'update_adler_notes',
    description: 'Update your persistent notes about the user — things to remember across conversations',
    input_schema: {
      type: 'object' as const,
      properties: {
        notes: { type: 'string', description: 'Full updated notes (replaces existing)' },
      },
      required: ['notes'],
    },
  },
  {
    name: 'add_journal_entry',
    description: 'Add a journal entry on behalf of the user if they share something worth recording',
    input_schema: {
      type: 'object' as const,
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
];

function applyTool(name: string, input: Record<string, unknown>): void {
  switch (name) {
    case 'add_task':
      state.addTask({
        title: input.title as string,
        priority: input.priority as 'p1' | 'p2' | 'p3',
        category: input.category as string,
        done: false,
        column: 'today',
        agentBadge: 'Adler',
      });
      break;
    case 'log_habit':
      state.toggleHabitToday(input.id as string);
      break;
    case 'update_goal':
      state.updateGoalProgress(input.id as string, input.pct as number);
      break;
    case 'update_adler_notes':
      setState({ adlerNotes: input.notes as string });
      break;
    case 'add_journal_entry': {
      const s = getState();
      const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      setState({
        journalEntries: [
          { id: `j-${Date.now()}`, date, text: input.text as string },
          ...s.journalEntries,
        ],
      });
      break;
    }
  }
}

function buildContext(): string {
  const s = getState();
  const now = new Date();
  const hour = now.getHours();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const todayTasks = s.tasks.filter((t) => t.column === 'today');
  const doneTasks = todayTasks.filter((t) => t.done);
  const pendingTasks = todayTasks.filter((t) => !t.done);
  const p1Pending = pendingTasks.filter((t) => t.priority === 'p1');

  const habitsDone = s.habits.filter((h) => h.completedToday);
  const habitsPending = s.habits.filter((h) => !h.completedToday);

  const recentMemory = s.adlerMemory.slice(-12);

  return `
CURRENT TIME: ${timeStr} on ${dateStr}

TASKS TODAY:
  Done (${doneTasks.length}): ${doneTasks.map((t) => `"${t.title}"`).join(', ') || 'none'}
  Pending (${pendingTasks.length}): ${pendingTasks.map((t) => `[${t.id}] ${t.priority.toUpperCase()} "${t.title}"`).join(', ') || 'none'}
  ${p1Pending.length > 0 ? `⚠ ${p1Pending.length} P1 tasks still open` : ''}

HABITS:
  Done: ${habitsDone.map((h) => h.name).join(', ') || 'none'}
  Pending: ${habitsPending.map((h) => `[${h.id}] ${h.name} (${h.streak}🔥 streak)`).join(', ') || 'none'}

GOALS:
  ${s.goals.map((g) => `[${g.id}] ${g.name}: ${g.pct}% — ${g.current}/${g.target}`).join('\n  ')}

INBOX: ${s.comms.filter((c) => c.status === 'open').length} open messages

CURRENTLY READING: ${s.books.filter((b) => b.status === 'reading').map((b) => `${b.title} by ${b.author} (${b.pct}%)`).join(', ') || 'nothing'}

YOUR NOTES ON THIS USER:
${s.adlerNotes || '(none yet — update these as you learn about them)'}

RECENT CONVERSATION:
${recentMemory.map((m) => `${m.role === 'user' ? 'User' : 'Adler'}: ${m.content}`).join('\n') || '(no history yet)'}

TIME CONTEXT: ${hour < 9 ? 'Early morning' : hour < 12 ? 'Morning' : hour < 14 ? 'Midday' : hour < 17 ? 'Afternoon' : hour < 20 ? 'Evening' : 'Night'}
`.trim();
}

function appendMemory(role: 'user' | 'adler', content: string): void {
  const s = getState();
  const memory = [...s.adlerMemory, { role, content, ts: Date.now() }];
  // Keep last 40 messages
  setState({ adlerMemory: memory.slice(-40) });
}

export async function runAdler(userMessage: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return 'ANTHROPIC_API_KEY not configured.';

  appendMemory('user', userMessage);

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `${ADLER_SYSTEM}\n\n${buildContext()}`,
    tools: ADLER_TOOLS,
    messages: [{ role: 'user', content: userMessage }],
  });

  for (const block of response.content) {
    if (block.type === 'tool_use') {
      applyTool(block.name, block.input as Record<string, unknown>);
    }
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const reply = textBlock && textBlock.type === 'text' ? textBlock.text : "Got it.";

  appendMemory('adler', reply);
  setState({ adlerLastContact: Date.now() });

  return reply;
}

// ── Proactive hourly check ────────────────────────────────────────────────────

const PROACTIVE_SYSTEM = `${ADLER_SYSTEM}

You are deciding whether to proactively reach out to the user RIGHT NOW.

Evaluate the current state of their dashboard and decide:
1. Is there something worth saying at this hour?
2. If yes, what is the single most important thing?

GUIDELINES FOR REACHING OUT:
- Morning (7-9am): brief good morning only if there are urgent tasks or the day looks heavy
- Midday (12-1pm): check in if P1 tasks are still untouched
- Afternoon (3-5pm): nudge if habits haven't been logged and day is ending
- Evening (7-9pm): habit reminder if any are incomplete; ask the daily reflection question (once per day)
- Night (9pm+): only reach out if something is critically overdue
- Any time: if a streak is about to break (> 20 day streak, habit not logged after 6pm), always reach out
- Don't reach out if you messaged in the last 90 minutes unless something changed significantly

Respond with JSON only:
{
  "shouldContact": true/false,
  "reason": "brief internal reason",
  "message": "the actual message to send (only if shouldContact is true)"
}`;

export async function adlerProactiveCheck(): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const s = getState();
  const minutesSinceContact = (Date.now() - s.adlerLastContact) / 60000;

  // Hard minimum: never more often than every 50 minutes
  if (minutesSinceContact < 50) return null;

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: PROACTIVE_SYSTEM,
      messages: [{ role: 'user', content: buildContext() }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    const raw = textBlock.text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { shouldContact: boolean; reason: string; message: string };

    if (!parsed.shouldContact) return null;

    appendMemory('adler', parsed.message);
    setState({ adlerLastContact: Date.now() });

    return parsed.message;
  } catch {
    return null;
  }
}
