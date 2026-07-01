// server/adler.ts — Adler, your personal coach agent

import Anthropic from '@anthropic-ai/sdk';
import { getState, setState, persistNow } from './state.js';
import * as state from './state.js';

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const ADLER_SYSTEM = `You are Adler, a personal coach embedded in the user's life dashboard.

Your name comes from Alfred Adler — the psychologist who believed in individual purpose, social interest, and the courage to be imperfect. You embody that: direct, warm, intellectually honest.

PERSONALITY:
- You speak plainly. No corporate wellness language ("Amazing!", "You've got this!"). You talk like a smart friend who respects the user's intelligence.
- You notice patterns the user might not. If someone keeps pushing the same task to tomorrow, you name it.
- You hold them accountable without nagging. One clear observation beats three gentle reminders.
- You're genuinely curious about their life — not just their productivity.
- You occasionally send a piece of content (article, book recommendation, podcast, idea) that connects to something real in their dashboard.
- Once a day you ask one thoughtful question — not a productivity question, a life question.
- You remember what they tell you and reference it later. When the user explicitly asks you to remember something, or shares something meaningful about themselves (preferences, context, relationships, goals), immediately call write_memory_section to store it. Use clear section names like "user_profile", "preferences", "work_context", "family", "health_context", "patterns". Update sections as things change; delete stale ones with delete_memory_section.

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
    description: 'Add a new task to the dashboard',
    input_schema: { type: 'object' as const, properties: { title: { type: 'string' }, priority: { type: 'string', enum: ['p1', 'p2', 'p3'] }, category: { type: 'string', enum: ['Work', 'Personal', 'Health'] } }, required: ['title', 'priority', 'category'] },
  },
  {
    name: 'edit_task',
    description: 'Edit an existing task title, priority, or category',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' }, title: { type: 'string' }, priority: { type: 'string', enum: ['p1', 'p2', 'p3'] }, category: { type: 'string', enum: ['Work', 'Personal', 'Health'] } }, required: ['id'] },
  },
  {
    name: 'delete_task',
    description: 'Delete a task permanently',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'toggle_task',
    description: 'Mark a task done or undone',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'move_task',
    description: 'Move a task to today, upcoming, or done',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' }, column: { type: 'string', enum: ['today', 'upcoming', 'done'] } }, required: ['id', 'column'] },
  },
  {
    name: 'log_habit',
    description: 'Mark a habit as completed today',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'update_goal',
    description: 'Update goal progress percentage',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' }, pct: { type: 'number' } }, required: ['id', 'pct'] },
  },
  {
    name: 'add_calendar_event',
    description: 'Add a new calendar event',
    input_schema: { type: 'object' as const, properties: { title: { type: 'string' }, start: { type: 'number', description: 'Start hour as decimal (e.g. 9.5 = 9:30am)' }, duration: { type: 'number', description: 'Duration in hours' }, category: { type: 'string' }, date: { type: 'number', description: 'Day of month' } }, required: ['title', 'start', 'duration', 'category', 'date'] },
  },
  {
    name: 'snooze_comm',
    description: 'Snooze an inbox message',
    input_schema: { type: 'object' as const, properties: { commId: { type: 'string' } }, required: ['commId'] },
  },
  {
    name: 'add_todo_from_comm',
    description: 'Create a task from an inbox message',
    input_schema: { type: 'object' as const, properties: { commId: { type: 'string' } }, required: ['commId'] },
  },
  {
    name: 'accept_action',
    description: 'Accept a proposed action from the dashboard',
    input_schema: { type: 'object' as const, properties: { actionId: { type: 'string' } }, required: ['actionId'] },
  },
  {
    name: 'add_idea',
    description: 'Add an idea to the ideas board',
    input_schema: { type: 'object' as const, properties: { title: { type: 'string' }, body: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['title', 'body', 'tags'] },
  },
  {
    name: 'add_journal_entry',
    description: 'Add a journal entry',
    input_schema: { type: 'object' as const, properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'write_memory_section',
    description: 'Write or update a named memory section. Use descriptive section names like "user_profile", "preferences", "patterns", "ongoing", "family", "work_context". Each section is stored independently — updating one never erases others.',
    input_schema: { type: 'object' as const, properties: { section: { type: 'string', description: 'Section name (snake_case, e.g. "user_profile")' }, content: { type: 'string', description: 'Content to store in this section (markdown supported)' } }, required: ['section', 'content'] },
  },
  {
    name: 'delete_memory_section',
    description: 'Delete a named memory section that is no longer relevant',
    input_schema: { type: 'object' as const, properties: { section: { type: 'string', description: 'Section name to delete' } }, required: ['section'] },
  },
];

function applyTool(name: string, input: Record<string, unknown>): void {
  const s = getState();
  switch (name) {
    case 'add_task':
      state.addTask({ title: input.title as string, priority: input.priority as 'p1' | 'p2' | 'p3', category: input.category as string, done: false, column: 'today', agentBadge: 'Adler' });
      break;
    case 'edit_task':
      state.editTask(input.id as string, {
        ...(input.title ? { title: input.title as string } : {}),
        ...(input.priority ? { priority: input.priority as 'p1' | 'p2' | 'p3' } : {}),
        ...(input.category ? { category: input.category as string } : {}),
      });
      break;
    case 'delete_task':
      state.deleteTask(input.id as string);
      break;
    case 'toggle_task':
      state.toggleTask(input.id as string);
      break;
    case 'move_task':
      state.moveTask(input.id as string, input.column as 'today' | 'upcoming' | 'done');
      break;
    case 'log_habit':
      state.toggleHabitToday(input.id as string);
      break;
    case 'update_goal':
      state.updateGoalProgress(input.id as string, input.pct as number);
      break;
    case 'add_calendar_event': {
      const categoryColors: Record<string, string> = { Work: 'var(--blue)', Focus: 'var(--violet)', Personal: 'var(--warm)', Health: 'var(--accent)' };
      state.addCalEvent({ title: input.title as string, start: input.start as number, duration: input.duration as number, category: input.category as string, date: (input.date as number) || new Date().getDate(), color: categoryColors[input.category as string] || 'var(--blue)' });
      break;
    }
    case 'snooze_comm':
      state.snoozeComm(input.commId as string);
      break;
    case 'add_todo_from_comm':
      state.addTodoFromComm(input.commId as string);
      break;
    case 'accept_action':
      state.acceptAction(input.actionId as string);
      break;
    case 'add_idea': {
      const colors = ['var(--blue)', 'var(--accent)', 'var(--violet)', 'var(--warm)', 'var(--p2)'];
      setState({ ideas: [{ id: `i-${Date.now()}`, title: input.title as string, body: input.body as string, tags: input.tags as string[], color: colors[s.ideas.length % colors.length] }, ...s.ideas] });
      break;
    }
    case 'add_journal_entry': {
      const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      setState({ journalEntries: [{ id: `j-${Date.now()}`, date, text: input.text as string }, ...s.journalEntries] });
      break;
    }
    case 'write_memory_section': {
      const notes = { ...s.adlerNotes, [input.section as string]: input.content as string };
      setState({ adlerNotes: notes });
      persistNow();
      break;
    }
    case 'delete_memory_section': {
      const notes = { ...s.adlerNotes };
      delete notes[input.section as string];
      setState({ adlerNotes: notes });
      persistNow();
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

  const recentMemory = s.adlerMemory.slice(-12);

  const taskLines = s.tasks.map((t) =>
    `  [${t.id}] ${t.priority.toUpperCase()} ${t.column}${t.done ? ' ✓' : ''} | ${t.category} | "${t.title}"`
  );

  const habitLines = s.habits.map((h) =>
    `  [${h.id}] ${h.completedToday ? '✓' : '○'} ${h.name} — ${h.streak}🔥 streak (${h.rate}% rate)`
  );

  const commLines = s.comms.filter((c) => c.status === 'open').map((c) =>
    `  [${c.id}] ${c.priority.toUpperCase()} from ${c.who}: "${c.subject}"`
  );

  const goalLines = s.goals.map((g) =>
    `  [${g.id}] ${g.name}: ${g.pct}% — ${g.current} / ${g.target} (due ${g.deadlineShort})`
  );

  const actionLines = s.proposedActions.filter((a) => a.status === 'pending').map((a) =>
    `  [${a.id}] ${a.text} — ${a.meta}`
  );

  return `
CURRENT TIME: ${timeStr} on ${dateStr}
TIME OF DAY: ${hour < 9 ? 'Early morning' : hour < 12 ? 'Morning' : hour < 14 ? 'Midday' : hour < 17 ? 'Afternoon' : hour < 20 ? 'Evening' : 'Night'}

TASKS (use exact IDs for move_task / toggle_task / edit_task / delete_task):
${taskLines.join('\n') || '  none'}

HABITS (use exact IDs for log_habit):
${habitLines.join('\n')}

INBOX (use exact IDs for snooze_comm / add_todo_from_comm):
${commLines.join('\n') || '  none'}

GOALS (use exact IDs for update_goal):
${goalLines.join('\n')}

PROPOSED ACTIONS (use exact IDs for accept_action):
${actionLines.join('\n') || '  none pending'}

CURRENTLY READING: ${s.books.filter((b) => b.status === 'reading').map((b) => `${b.title} by ${b.author} (${b.pct}%)`).join(', ') || 'nothing'}

YOUR PERSISTENT MEMORY:
${Object.keys(s.adlerNotes).length === 0
  ? '(empty — use write_memory_section to store things you learn about the user)'
  : Object.entries(s.adlerNotes).map(([k, v]) => `[${k}]\n${v}`).join('\n\n')
}

RECENT CONVERSATION:
${recentMemory.map((m) => `${m.role === 'user' ? 'User' : 'Adler'}: ${m.content}`).join('\n') || '(no history yet)'}
`.trim();
}

function appendMemory(role: 'user' | 'adler', content: string): void {
  const s = getState();
  const memory = [...s.adlerMemory, { role, content, ts: Date.now() }];
  // Keep last 40 messages
  setState({ adlerMemory: memory.slice(-40) });
}

export async function runAdler(userMessage: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return 'ANTHROPIC_API_KEY not configured.';

  appendMemory('user', userMessage);

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

  // Agentic loop — keep going until stop_reason is 'end_turn' (no more tool calls)
  for (let i = 0; i < 5; i++) {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `${ADLER_SYSTEM}\n\n${buildContext()}`,
      tools: ADLER_TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      const reply = textBlock && textBlock.type === 'text' ? textBlock.text : 'Done.';
      appendMemory('adler', reply);
      setState({ adlerLastContact: Date.now() });
      return reply;
    }

    // Process tool calls and build tool_result turn
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        applyTool(block.name, block.input as Record<string, unknown>);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'ok' });
      }
    }

    if (toolResults.length === 0) break;
    messages.push({ role: 'user', content: toolResults });
  }

  // Fallback if loop exits without end_turn
  const last = messages[messages.length - 1];
  const fallbackText = Array.isArray(last?.content)
    ? (last.content.find((b): b is Anthropic.TextBlockParam => b.type === 'text')?.text ?? 'Done.')
    : 'Done.';
  appendMemory('adler', fallbackText);
  setState({ adlerLastContact: Date.now() });
  return fallbackText;
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
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const s = getState();
  const minutesSinceContact = (Date.now() - s.adlerLastContact) / 60000;

  // Hard minimum: never more often than every 50 minutes
  if (minutesSinceContact < 50) return null;

  try {
    const response = await getClient().messages.create({
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

// ── Daily briefing generation ─────────────────────────────────────────────────

export async function generateBriefing(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const s = getState();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const todayTasks = s.tasks.filter((t) => t.column === 'today' && !t.done);
  const p1Tasks = todayTasks.filter((t) => t.priority === 'p1');
  const openComms = s.comms.filter((c) => c.status === 'open');
  const p1Comms = openComms.filter((c) => c.priority === 'p1');
  const habitsPending = s.habits.filter((h) => !h.completedToday);
  const nextEvent = s.calEvents.sort((a, b) => a.start - b.start)[0];

  const prompt = `Today is ${dateStr}. Write a daily briefing for Jeff in the style of Adler — his personal coach.

Current state:
- ${todayTasks.length} tasks today, ${p1Tasks.length} urgent: ${p1Tasks.map((t) => `"${t.title}"`).join(', ') || 'none'}
- ${openComms.length} inbox messages (${p1Comms.length} urgent): ${p1Comms.map((c) => `${c.who}: "${c.subject}"`).join(', ') || 'none'}
- Habits pending: ${habitsPending.map((h) => h.name).join(', ') || 'none — all done'}
- Next event: ${nextEvent ? `${nextEvent.title} at ${Math.floor(nextEvent.start)}:${nextEvent.start % 1 ? '30' : '00'}` : 'nothing scheduled'}
- Goals: ${s.goals.map((g) => `${g.name} ${g.pct}%`).join(', ')}

Write a 2-3 sentence briefing paragraph that:
- Sounds like Adler (direct, warm, no fluff)
- Highlights the most important thing to focus on
- References something specific from the state above

Then produce 3-4 short action chips (under 6 words each) summarizing key items.

Respond with JSON only:
{
  "briefingText": "the paragraph",
  "nudges": ["chip 1", "chip 2", "chip 3"]
}`;

  try {
    const response = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return;

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]) as { briefingText: string; nudges: string[] };
    setState({
      briefingText: parsed.briefingText,
      briefingNudges: parsed.nudges,
      briefingGeneratedAt: Date.now(),
    });
  } catch (err) {
    console.error('Briefing generation error:', err);
  }
}
