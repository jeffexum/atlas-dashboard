// server/tools.ts — shared assistant tool set used by Adler (Telegram) and the Whiteboard.
// One definition of what the assistant can do; both surfaces get identical capabilities.

import type Anthropic from '@anthropic-ai/sdk';
import { getState, setState, persistNow } from './state.js';
import * as state from './state.js';
import {
  sendEmail, replyToEmail, isAuthenticated, syncMail, syncCalendar,
  learnUserProfile, fetchEmailBody,
} from './outlook.js';
import { syncGoogleCalendar, isGoogleAuthenticated } from './google.js';
import { isGmailConnected, syncGmail, replyGmail, fetchGmailBody } from './gmail.js';
import { syncOura, isOuraConfigured } from './oura.js';

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  // ── Tasks ──
  {
    name: 'add_task',
    description: 'Add a new task to the dashboard. Set dueDate when the user mentions a deadline.',
    input_schema: { type: 'object' as const, properties: { title: { type: 'string' }, priority: { type: 'string', enum: ['p1', 'p2', 'p3'] }, category: { type: 'string', enum: ['Work', 'Personal', 'Health'] }, column: { type: 'string', enum: ['today', 'upcoming'] }, dueDate: { type: 'string', description: 'Optional due date, YYYY-MM-DD' } }, required: ['title', 'priority', 'category'] },
  },
  {
    name: 'edit_task',
    description: 'Edit an existing task title, priority, category, or due date',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' }, title: { type: 'string' }, priority: { type: 'string', enum: ['p1', 'p2', 'p3'] }, category: { type: 'string', enum: ['Work', 'Personal', 'Health'] }, dueDate: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['id'] },
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
  // ── Habits / goals ──
  {
    name: 'add_habit',
    description: 'Create a new habit to track (e.g. "Morning run", cadence "Daily")',
    input_schema: { type: 'object' as const, properties: { name: { type: 'string' }, cadence: { type: 'string', description: 'e.g. Daily, Weekdays, 3x per week' } }, required: ['name'] },
  },
  {
    name: 'delete_habit',
    description: 'Delete a habit and its history permanently',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'log_habit',
    description: 'Mark a habit as completed today (toggles — calling again un-logs it)',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'update_goal',
    description: 'Update goal progress percentage',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' }, pct: { type: 'number' } }, required: ['id', 'pct'] },
  },
  // ── Calendar ──
  {
    name: 'add_calendar_event',
    description: 'Add a new calendar event to the Atlas dashboard',
    input_schema: { type: 'object' as const, properties: { title: { type: 'string' }, start: { type: 'number', description: 'Start hour as decimal (e.g. 9.5 = 9:30am)' }, duration: { type: 'number', description: 'Duration in hours' }, category: { type: 'string' }, date: { type: 'number', description: 'Day of month' } }, required: ['title', 'start', 'duration', 'category', 'date'] },
  },
  // ── Inbox / email ──
  {
    name: 'read_email',
    description: 'Fetch the complete body of an email when the excerpt in context is not enough',
    input_schema: { type: 'object' as const, properties: { commId: { type: 'string' } }, required: ['commId'] },
  },
  {
    name: 'reply_to_email',
    description: 'Reply to an email IN ITS THREAD (correct recipients, subject, and threading come from the original). ALWAYS prefer this over send_email when responding to an existing inbox email. Set replyAll=true to include everyone on the original.',
    input_schema: { type: 'object' as const, properties: { commId: { type: 'string', description: 'The inbox email id being replied to' }, body: { type: 'string', description: 'Reply body (plain text)' }, replyAll: { type: 'boolean' } }, required: ['commId', 'body'] },
  },
  {
    name: 'send_email',
    description: 'Send a brand-NEW email (starts a new thread). Only for emails that are NOT a response to something in the inbox — use reply_to_email for those.',
    input_schema: { type: 'object' as const, properties: { to: { type: 'string', description: 'Recipient address or a name from the inbox' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] },
  },
  {
    name: 'create_draft',
    description: 'Create an email draft on the dashboard for the user to review before sending (does NOT send). Write it in the user\'s voice per the profile. Link it to an inbox email with commId so it sends as an in-thread reply.',
    input_schema: { type: 'object' as const, properties: { commId: { type: 'string', description: 'Inbox email this replies to (omit for a fresh email)' }, to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] },
  },
  {
    name: 'send_draft',
    description: 'Send an existing draft from the dashboard. Sends as an in-thread reply if the draft is linked to an inbox email.',
    input_schema: { type: 'object' as const, properties: { draftId: { type: 'string' } }, required: ['draftId'] },
  },
  {
    name: 'discard_draft',
    description: 'Discard a draft that is no longer needed',
    input_schema: { type: 'object' as const, properties: { draftId: { type: 'string' } }, required: ['draftId'] },
  },
  {
    name: 'workshop_draft',
    description: 'Pull a draft into the Whiteboard as a new session so the user can workshop it there. Use when a draft needs more work than a quick edit.',
    input_schema: { type: 'object' as const, properties: { draftId: { type: 'string' } }, required: ['draftId'] },
  },
  {
    name: 'snooze_comm',
    description: 'Snooze an inbox message (dims it but keeps it visible)',
    input_schema: { type: 'object' as const, properties: { commId: { type: 'string' } }, required: ['commId'] },
  },
  {
    name: 'dismiss_comm',
    description: 'Remove an email from the Atlas inbox view — for emails that need no response. Does NOT delete the email from Outlook, and it stays hidden across re-syncs.',
    input_schema: { type: 'object' as const, properties: { commId: { type: 'string' } }, required: ['commId'] },
  },
  {
    name: 'add_todo_from_comm',
    description: 'Create a task from an inbox message',
    input_schema: { type: 'object' as const, properties: { commId: { type: 'string' } }, required: ['commId'] },
  },
  // ── Shopping list ──
  {
    name: 'add_shopping_item',
    description: 'Add an item to the shopping list. Category: Groceries (food), House (household supplies/repairs), or Misc.',
    input_schema: { type: 'object' as const, properties: { name: { type: 'string' }, category: { type: 'string', enum: ['Groceries', 'House', 'Misc'] } }, required: ['name', 'category'] },
  },
  {
    name: 'check_shopping_item',
    description: 'Mark a shopping item as bought (toggles — calling again un-checks it)',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'remove_shopping_item',
    description: 'Remove an item from the shopping list entirely',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  // ── Sync / learning ──
  {
    name: 'sync_data',
    description: 'Re-sync email inbox and both calendars (Outlook work + Gmail personal) from their sources right now',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'learn_style',
    description: 'Re-analyze the user\'s sent email to refresh the profile of their communication and management style. Run when the user says drafts don\'t sound like them.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  // ── Ideas / journal ──
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
    name: 'read_document',
    description: 'Read the full text of an uploaded knowledge document (see KNOWLEDGE DOCUMENTS in context for ids)',
    input_schema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  // ── Memory ──
  {
    name: 'write_memory_section',
    description: 'Write or update a named memory section. Use descriptive section names like "user_profile", "preferences", "patterns", "management_style", "family", "work_context". Each section is stored independently — updating one never erases others.',
    input_schema: { type: 'object' as const, properties: { section: { type: 'string', description: 'Section name (snake_case)' }, content: { type: 'string' } }, required: ['section', 'content'] },
  },
  {
    name: 'delete_memory_section',
    description: 'Delete a named memory section that is no longer relevant',
    input_schema: { type: 'object' as const, properties: { section: { type: 'string' } }, required: ['section'] },
  },
];

// Executes a tool and returns a result string for the model (errors are returned,
// not thrown, so the assistant can relay what went wrong).
export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  const s = getState();
  try {
    switch (name) {
      case 'add_task':
        state.addTask({ title: input.title as string, priority: input.priority as 'p1' | 'p2' | 'p3', category: input.category as string, done: false, column: (input.column as 'today' | 'upcoming') || 'today', agentBadge: 'Adler', ...(input.dueDate ? { dueDate: input.dueDate as string } : {}) });
        return 'Task added.';
      case 'edit_task':
        state.editTask(input.id as string, {
          ...(input.title ? { title: input.title as string } : {}),
          ...(input.priority ? { priority: input.priority as 'p1' | 'p2' | 'p3' } : {}),
          ...(input.category ? { category: input.category as string } : {}),
          ...(input.dueDate ? { dueDate: input.dueDate as string } : {}),
        });
        return 'Task updated.';
      case 'delete_task':
        state.deleteTask(input.id as string);
        return 'Task deleted.';
      case 'toggle_task':
        state.toggleTask(input.id as string);
        return 'Task toggled.';
      case 'move_task':
        state.moveTask(input.id as string, input.column as 'today' | 'upcoming' | 'done');
        return 'Task moved.';
      case 'add_habit': {
        const habit = state.addHabit(input.name as string, (input.cadence as string) || 'Daily');
        await persistNow();
        return `Habit "${habit.name}" created (${habit.cadence}), id ${habit.id}.`;
      }
      case 'delete_habit':
        state.deleteHabit(input.id as string);
        await persistNow();
        return 'Habit deleted.';
      case 'log_habit':
        state.toggleHabitToday(input.id as string);
        return 'Habit logged.';
      case 'update_goal':
        state.updateGoalProgress(input.id as string, input.pct as number);
        return 'Goal updated.';
      case 'add_calendar_event': {
        const categoryColors: Record<string, string> = { Work: 'var(--blue)', Focus: 'var(--violet)', Personal: 'var(--warm)', Health: 'var(--accent)' };
        const now = new Date();
        state.addCalEvent({ title: input.title as string, start: input.start as number, duration: input.duration as number, category: input.category as string, date: (input.date as number) || now.getDate(), month: now.getMonth() + 1, year: now.getFullYear(), color: categoryColors[input.category as string] || 'var(--blue)' });
        return 'Event added.';
      }
      case 'read_email': {
        const commId = input.commId as string;
        const body = commId.startsWith('gm-')
          ? await fetchGmailBody(commId)
          : await fetchEmailBody(commId);
        return body.slice(0, 8000);
      }
      case 'reply_to_email': {
        const commId = input.commId as string;
        const comm = s.comms.find((c) => c.id === commId);
        if (commId.startsWith('gm-')) {
          if (!isGmailConnected()) return 'Error: Gmail not connected.';
          await replyGmail(commId, input.body as string, !!input.replyAll);
        } else {
          if (!isAuthenticated()) return 'Error: Outlook not connected.';
          await replyToEmail(commId, input.body as string, !!input.replyAll);
        }
        return `Reply sent in-thread${input.replyAll ? ' (reply-all)' : ''} to ${comm?.who || 'recipient'}.`;
      }
      case 'send_email':
        if (!isAuthenticated()) return 'Error: Outlook not connected.';
        await sendEmail(input.to as string, input.subject as string, input.body as string);
        return `Email sent to ${input.to}.`;
      case 'create_draft': {
        const draft: state.Draft = {
          id: `d-${Date.now()}`,
          to: input.to as string,
          re: input.subject as string,
          text: input.body as string,
          status: 'ready',
          ...(input.commId ? { commId: input.commId as string } : {}),
        };
        setState({ drafts: [...s.drafts, draft] });
        await persistNow();
        return `Draft ${draft.id} created${draft.commId ? ' (linked to thread — will send as reply)' : ''}.`;
      }
      case 'send_draft': {
        if (!isAuthenticated() && !isGmailConnected()) return 'Error: no mail account connected.';
        const draft = s.drafts.find((d) => d.id === input.draftId);
        if (!draft) return `Error: draft ${input.draftId} not found.`;
        if (draft.status === 'sent') return 'Error: draft already sent.';
        if (draft.commId?.startsWith('gm-')) {
          await replyGmail(draft.commId, draft.text);
        } else if (draft.commId) {
          await replyToEmail(draft.commId, draft.text);
        } else {
          await sendEmail(draft.to, draft.re, draft.text);
        }
        setState({ drafts: s.drafts.map((d) => d.id === draft.id ? { ...d, status: 'sent' as const } : d) });
        await persistNow();
        return `Draft sent to ${draft.to}${draft.commId ? ' as in-thread reply' : ''}.`;
      }
      case 'discard_draft':
        setState({ drafts: s.drafts.map((d) => d.id === input.draftId ? { ...d, status: 'discarded' as const } : d) });
        return 'Draft discarded.';
      case 'workshop_draft': {
        const draft = s.drafts.find((d) => d.id === input.draftId);
        if (!draft) return `Error: draft ${input.draftId} not found.`;
        const comm = draft.commId ? s.comms.find((c) => c.id === draft.commId) : undefined;
        const { saveSession } = await import('./whiteboard.js');
        const sessionId = `wb-draft-${Date.now()}`;
        await saveSession({
          id: sessionId,
          title: `Draft: ${draft.re}`.slice(0, 60),
          startedAt: Date.now(),
          messages: [
            {
              role: 'user',
              text: `Let's workshop this email draft.\n\n${comm ? `ORIGINAL EMAIL from ${comm.who} — "${comm.subject}":\n${(comm.body || comm.preview).slice(0, 3000)}\n\n` : ''}CURRENT DRAFT (to ${draft.to}, re: "${draft.re}", draftId: ${draft.id}):\n${draft.text}`,
            },
          ],
        });
        return `Draft pulled into the Whiteboard as session "${`Draft: ${draft.re}`.slice(0, 60)}". Open it via Whiteboard → Sessions.`;
      }
      case 'snooze_comm':
        state.snoozeComm(input.commId as string);
        return 'Snoozed.';
      case 'dismiss_comm':
        state.dismissComm(input.commId as string);
        await persistNow();
        return 'Removed from the Atlas inbox (still in Outlook).';
      case 'add_todo_from_comm':
        state.addTodoFromComm(input.commId as string);
        return 'Task created from email.';
      case 'add_shopping_item': {
        const item = state.addShoppingItem(input.name as string, input.category as state.ShoppingCategory, 'Adler');
        await persistNow();
        return `"${item.name}" added to shopping list (${item.category}).`;
      }
      case 'check_shopping_item':
        state.toggleShoppingItem(input.id as string);
        return 'Shopping item toggled.';
      case 'remove_shopping_item':
        state.deleteShoppingItem(input.id as string);
        await persistNow();
        return 'Shopping item removed.';
      case 'sync_data': {
        const parts: string[] = [];
        if (isAuthenticated()) {
          await syncMail();
          await syncCalendar();
          parts.push('Outlook mail + calendar synced');
        } else parts.push('Outlook not connected');
        if (isGoogleAuthenticated()) {
          await syncGoogleCalendar();
          parts.push('Google calendar synced');
        } else parts.push('Google not connected');
        if (isGmailConnected()) {
          await syncGmail();
          parts.push('Gmail synced');
        }
        if (isOuraConfigured()) {
          await syncOura();
          parts.push('Oura health data synced');
        }
        const after = getState();
        return `${parts.join('; ')}. Now: ${after.comms.filter((c) => c.status === 'open').length} open emails, ${after.calEvents.length} calendar events.`;
      }
      case 'learn_style': {
        if (!isAuthenticated()) return 'Error: Outlook not connected.';
        const profile = await learnUserProfile();
        return `Style profile refreshed (${profile.length} chars).`;
      }
      case 'add_idea': {
        const colors = ['var(--blue)', 'var(--accent)', 'var(--violet)', 'var(--warm)', 'var(--p2)'];
        setState({ ideas: [{ id: `i-${Date.now()}`, title: input.title as string, body: input.body as string, tags: (input.tags as string[]) || [], color: colors[s.ideas.length % colors.length] }, ...s.ideas] });
        return 'Idea added.';
      }
      case 'add_journal_entry': {
        const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        setState({ journalEntries: [{ id: `j-${Date.now()}`, date, text: input.text as string }, ...s.journalEntries] });
        return 'Journal entry added.';
      }
      case 'read_document': {
        const doc = s.knowledge.find((k) => k.id === input.id);
        if (!doc) return `Error: document ${input.id} not found.`;
        return doc.content.slice(0, 30000);
      }
      case 'write_memory_section': {
        setState({ adlerNotes: { ...s.adlerNotes, [input.section as string]: input.content as string } });
        await persistNow();
        return `Memory section "${input.section}" saved.`;
      }
      case 'delete_memory_section': {
        const notes = { ...s.adlerNotes };
        delete notes[input.section as string];
        setState({ adlerNotes: notes });
        await persistNow();
        return `Memory section "${input.section}" deleted.`;
      }
      default:
        return `Error: unknown tool "${name}".`;
    }
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
