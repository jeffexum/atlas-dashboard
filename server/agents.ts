// server/agents.ts — Four AI agents using @anthropic-ai/sdk

import Anthropic from '@anthropic-ai/sdk';
import type { ServerState } from './state.js';
import * as state from './state.js';

export interface AppliedAction {
  tool: string;
  input: Record<string, unknown>;
}

type AgentName = 'planner' | 'coach' | 'keeper' | 'scout';

const AGENT_META: Record<AgentName, { name: string; role: string; personality: string; emoji: string }> = {
  planner: {
    name: 'Planner',
    role: 'scheduling & task',
    personality: 'Efficient, proactive. You anticipate scheduling conflicts and prep tasks.',
    emoji: '📅',
  },
  coach: {
    name: 'Coach',
    role: 'health & habits',
    personality: 'Warm, honest. You celebrate streaks and gently challenge missed habits.',
    emoji: '💪',
  },
  keeper: {
    name: 'Keeper',
    role: 'relationships & reminders',
    personality: 'Thoughtful, detail-oriented. You remember the human side of commitments.',
    emoji: '🔔',
  },
  scout: {
    name: 'Scout',
    role: 'ideas & reading',
    personality: 'Curious, connective. You link ideas across books, journal entries, and captures.',
    emoji: '📚',
  },
};

function routeAgent(message: string, hint?: string): AgentName {
  if (hint && hint !== 'auto' && hint in AGENT_META) return hint as AgentName;

  const t = message.toLowerCase();
  if (/calendar|schedule|meeting|inbox|email|task|todo|plan|review/.test(t)) return 'planner';
  if (/habit|health|goal|workout|sleep|run|exercise|streak/.test(t)) return 'coach';
  if (/reminder|person|follow.?up|birthday|message|contact/.test(t)) return 'keeper';
  if (/book|read|idea|journal|note|highlight|capture/.test(t)) return 'scout';
  return 'planner';
}

function buildStateContext(s: ServerState): string {
  const todayTasks = s.tasks.filter((t) => t.column === 'today');
  const upcomingTasks = s.tasks.filter((t) => t.column === 'upcoming');
  const openComms = s.comms.filter((c) => c.status === 'open');
  const activeGoals = s.goals.filter((g) => g.pct < 100);
  const nextEvent = s.calEvents.sort((a, b) => a.start - b.start)[0];

  const taskLines = [...todayTasks, ...upcomingTasks].map(
    (t) => `  [${t.id}] ${t.priority.toUpperCase()} ${t.column}: ${t.title}${t.done ? ' (done)' : ''}`
  );

  const habitLines = s.habits.map(
    (h) => `  [${h.id}] ${h.name} — streak ${h.streak} — today: ${h.completedToday ? 'done' : 'pending'}`
  );

  const commLines = openComms.slice(0, 5).map(
    (c) => `  [${c.id}] ${c.priority.toUpperCase()} from ${c.who}: ${c.subject}`
  );

  const goalLines = activeGoals.map(
    (g) => `  [${g.id}] ${g.name} — ${g.pct}% (${g.current} / ${g.target})`
  );

  return [
    `TASKS (use these exact IDs for move_task/toggle_task):`,
    taskLines.join('\n') || '  none',
    `\nHABITS (use these exact IDs for log_habit):`,
    habitLines.join('\n'),
    `\nINBOX (use these exact IDs for snooze_comm/add_todo_from_comm):`,
    commLines.join('\n') || '  none',
    `\nGOALS (use these exact IDs for update_goal):`,
    goalLines.join('\n'),
    nextEvent ? `\nNEXT EVENT: ${nextEvent.title} at ${Math.floor(nextEvent.start)}:${nextEvent.start % 1 ? '30' : '00'}` : '',
  ].join('\n');
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_task',
    description: 'Add a new task to the user\'s task list',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title' },
        priority: { type: 'string', enum: ['p1', 'p2', 'p3'], description: 'Task priority' },
        category: { type: 'string', enum: ['Work', 'Personal', 'Health'], description: 'Task category' },
      },
      required: ['title', 'priority', 'category'],
    },
  },
  {
    name: 'toggle_task',
    description: 'Toggle a task done/undone',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Task ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'edit_task',
    description: 'Edit an existing task title, priority, or category',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Task ID' },
        title: { type: 'string', description: 'New title (optional)' },
        priority: { type: 'string', enum: ['p1', 'p2', 'p3'], description: 'New priority (optional)' },
        category: { type: 'string', enum: ['Work', 'Personal', 'Health'], description: 'New category (optional)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task permanently',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Task ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'move_task',
    description: 'Move a task to a different column',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Task ID' },
        column: { type: 'string', enum: ['today', 'upcoming', 'done'], description: 'Target column' },
      },
      required: ['id', 'column'],
    },
  },
  {
    name: 'log_habit',
    description: 'Log a habit as completed today',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Habit ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_goal',
    description: 'Update goal progress percentage',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Goal ID' },
        pct: { type: 'number', description: 'New percentage (0-100)' },
      },
      required: ['id', 'pct'],
    },
  },
  {
    name: 'add_calendar_event',
    description: 'Add a new calendar event',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Event title' },
        start: { type: 'number', description: 'Start time as decimal hour (e.g. 9.5 = 9:30am)' },
        duration: { type: 'number', description: 'Duration in decimal hours' },
        category: { type: 'string', description: 'Event category' },
        date: { type: 'number', description: 'Day of month (June 2026), default 29' },
      },
      required: ['title', 'start', 'duration', 'category', 'date'],
    },
  },
  {
    name: 'add_todo_from_comm',
    description: 'Create a task from an inbox message',
    input_schema: {
      type: 'object' as const,
      properties: {
        commId: { type: 'string', description: 'Communication ID' },
      },
      required: ['commId'],
    },
  },
  {
    name: 'snooze_comm',
    description: 'Snooze an inbox message',
    input_schema: {
      type: 'object' as const,
      properties: {
        commId: { type: 'string', description: 'Communication ID' },
      },
      required: ['commId'],
    },
  },
  {
    name: 'accept_action',
    description: 'Accept a proposed action',
    input_schema: {
      type: 'object' as const,
      properties: {
        actionId: { type: 'string', description: 'Proposed action ID' },
      },
      required: ['actionId'],
    },
  },
  {
    name: 'add_idea',
    description: 'Add a new idea to the ideas board',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Idea title' },
        body: { type: 'string', description: 'Idea body/description' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for the idea' },
      },
      required: ['title', 'body', 'tags'],
    },
  },
  {
    name: 'add_journal_entry',
    description: 'Add a new journal entry',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Journal entry text' },
      },
      required: ['text'],
    },
  },
];

function applyToolCall(toolName: string, input: Record<string, unknown>): void {
  const s = state.getState();
  switch (toolName) {
    case 'add_task':
      state.addTask({
        title: input.title as string,
        priority: input.priority as 'p1' | 'p2' | 'p3',
        category: input.category as string,
        done: false,
        column: 'today',
        agentBadge: 'From AI',
      });
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
      const categoryColors: Record<string, string> = {
        Work: 'var(--blue)',
        Focus: 'var(--violet)',
        Personal: 'var(--warm)',
        Health: 'var(--accent)',
      };
      state.addCalEvent({
        title: input.title as string,
        start: input.start as number,
        duration: input.duration as number,
        category: input.category as string,
        date: (input.date as number) || 29,
        color: categoryColors[input.category as string] || 'var(--blue)',
      });
      break;
    }
    case 'add_todo_from_comm':
      state.addTodoFromComm(input.commId as string);
      break;
    case 'snooze_comm':
      state.snoozeComm(input.commId as string);
      break;
    case 'accept_action':
      state.acceptAction(input.actionId as string);
      break;
    case 'add_idea': {
      const colors = ['var(--blue)', 'var(--accent)', 'var(--violet)', 'var(--warm)', 'var(--p2)'];
      const color = colors[s.ideas.length % colors.length];
      state.setState({
        ideas: [
          { id: `i-${Date.now()}`, title: input.title as string, body: input.body as string, tags: input.tags as string[], color },
          ...s.ideas,
        ],
      });
      break;
    }
    case 'add_journal_entry':
      state.setState({
        journalEntries: [
          { id: `j-${Date.now()}`, date: 'Jun 29, 2026', text: input.text as string },
          ...state.getState().journalEntries,
        ],
      });
      break;
  }
}

export async function runAgent(input: {
  message: string;
  agentHint?: 'planner' | 'coach' | 'keeper' | 'scout' | 'auto';
  state: ServerState;
}): Promise<{ text: string; actions: AppliedAction[]; agent: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'YOUR_ANTHROPIC_API_KEY_HERE') {
    return {
      text: 'AI agents not configured — add ANTHROPIC_API_KEY to your .env',
      actions: [],
      agent: 'planner',
    };
  }

  const agentKey = routeAgent(input.message, input.agentHint);
  const meta = AGENT_META[agentKey];
  const stateContext = buildStateContext(input.state || state.getState());

  const systemPrompt = `You are ${meta.name}, the ${meta.role} agent in Atlas — a personal life dashboard.
You have access to the user's current state (tasks, habits, goals, inbox, calendar, etc.)
Current date: Monday June 29, 2026.
User: Alex

Your personality: ${meta.personality}

Current state summary:
${stateContext}

When the user asks you to DO something (add a task, log a habit, create an event, etc.):
- Act immediately. NEVER ask clarifying questions before calling a tool.
- Infer missing details from context: default priority is P2, default category is Work.
- If the user says "P1" or "urgent", use p1. If they mention health/fitness, use Health. Personal matters use Personal.
- After calling the tool, confirm in one short sentence what you did.
- Keep ALL responses under 2 sentences. No lists, no numbered options.`;

  const client = new Anthropic({ apiKey });
  const appliedActions: AppliedAction[] = [];

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: [{ role: 'user', content: input.message }],
    });

    // Apply any tool calls
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const toolInput = block.input as Record<string, unknown>;
        applyToolCall(block.name, toolInput);
        appliedActions.push({ tool: block.name, input: toolInput });
      }
    }

    // Extract text response
    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : "Done! I've taken care of that.";

    return { text, actions: appliedActions, agent: agentKey };
  } catch (err) {
    console.error('Agent error:', err);
    return {
      text: 'Sorry, I ran into an error. Please try again.',
      actions: [],
      agent: agentKey,
    };
  }
}
