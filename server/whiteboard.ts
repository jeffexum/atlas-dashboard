// server/whiteboard.ts — Full-featured AI chat for the Whiteboard screen

import Anthropic from '@anthropic-ai/sdk';
import { getState, setState, persistNow } from './state.js';
import { addTask } from './state.js';

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// ── Redis session storage ─────────────────────────────────────────────────────

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;
const SESSIONS_KEY = 'atlas:whiteboardSessions';

interface StoredSession {
  id: string;
  title: string;
  startedAt: number;
  messages: { role: string; text: string }[];
}

async function loadSessions(): Promise<StoredSession[]> {
  if (!REDIS_URL || !REDIS_TOKEN) return [];
  try {
    const res = await fetch(`${REDIS_URL}/get/${SESSIONS_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await res.json() as { result: string | null };
    return json.result ? JSON.parse(json.result) as StoredSession[] : [];
  } catch { return []; }
}

async function saveSessions(sessions: StoredSession[]): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  await fetch(`${REDIS_URL}/set/${SESSIONS_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(sessions)),
  });
}

export async function saveSession(session: StoredSession): Promise<void> {
  const sessions = await loadSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) sessions[idx] = session;
  else sessions.unshift(session);
  // Keep last 20 sessions
  await saveSessions(sessions.slice(0, 20));
}

export async function getSessions(): Promise<StoredSession[]> {
  return loadSessions();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  attachments?: { name: string; type: string; data: string }[];
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const s = getState();
  const todayTasks = s.tasks.filter((t) => t.column === 'today' && !t.done);
  const openComms = s.comms.filter((c) => c.status === 'open').slice(0, 5);

  const taskSummary = todayTasks.length
    ? todayTasks.map((t) => `- [${t.priority.toUpperCase()}] ${t.title}`).join('\n')
    : '- none';

  const commSummary = openComms.length
    ? openComms.map((c) => `- ${c.who}: ${c.subject}`).join('\n')
    : '- none';

  const profileSection = s.userProfile
    ? `\n\nUSER PROFILE:\n${s.userProfile.slice(0, 1500)}`
    : '';

  return `You are Adler, a sharp and thoughtful AI assistant embedded in Atlas — Jeff's personal life OS.

Jeff Williams is the CEO of Exum Instruments, a deep-tech mass spectrometry startup in Denver, CO.${profileSection}

CURRENT ATLAS SNAPSHOT:
Today's tasks:
${taskSummary}

Open inbox items:
${commSummary}

Goals: ${s.goals.length} active | Habits: ${s.habits.length} tracked

YOUR ROLE ON THE WHITEBOARD:
This is a freeform workspace. You can help with anything:
- Think through problems, brainstorm, strategize
- Workshop email drafts, proposals, investor updates
- Analyze uploaded documents (PDFs, images, spreadsheets)
- Review and give feedback on writing
- Plan, prioritize, and reason through decisions
- Answer questions, research, explain

Be direct, intelligent, and genuinely useful. Responses can be as long as needed — this is a working session, not a quick command. Use markdown for structure when helpful. You know Jeff's context well — use it.`;
}

// ── Main chat handler ─────────────────────────────────────────────────────────

export async function chat(history: ChatMessage[]): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  // Build Anthropic messages from history
  const messages: Anthropic.MessageParam[] = history.map((msg) => {
    if (!msg.attachments?.length) {
      return { role: msg.role, content: msg.text };
    }

    // Message with attachments
    const contentBlocks: Anthropic.ContentBlockParam[] = [];

    for (const att of msg.attachments) {
      if (att.type.startsWith('image/')) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: att.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: att.data,
          },
        });
      } else if (att.type === 'application/pdf') {
        contentBlocks.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: att.data,
          },
        } as Anthropic.ContentBlockParam);
      } else {
        // Plain text / CSV / other — inline as text
        contentBlocks.push({
          type: 'text',
          text: `[Attached file: ${att.name}]\n${att.data}`,
        });
      }
    }

    if (msg.text) {
      contentBlocks.push({ type: 'text', text: msg.text });
    }

    return { role: msg.role, content: contentBlocks };
  });

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages,
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text : '';
}

// ── Extract & apply actions from a conversation ───────────────────────────────

interface ExtractedAction {
  type: 'task' | 'journal';
  title?: string;
  body?: string;
  priority?: 'p1' | 'p2' | 'p3';
}

export async function extractAndApply(history: ChatMessage[]): Promise<{ tasks: number; journal: number }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const transcript = history
    .map((m) => `${m.role === 'user' ? 'Jeff' : 'Adler'}: ${m.text}`)
    .join('\n\n');

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `From this conversation, extract any clear action items and key decisions/insights worth journaling.

CONVERSATION:
${transcript}

Return JSON only:
{
  "actions": [
    { "type": "task", "title": "...", "priority": "p1|p2|p3" },
    { "type": "journal", "body": "Key insight or decision: ..." }
  ]
}

Only include things explicitly decided or committed to. Skip vague intentions.`,
    }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const raw = textBlock?.type === 'text' ? textBlock.text : '{"actions":[]}';

  let actions: ExtractedAction[] = [];
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { actions: ExtractedAction[] };
      actions = parsed.actions || [];
    }
  } catch { /* ignore */ }

  let taskCount = 0;
  let journalCount = 0;

  for (const action of actions) {
    if (action.type === 'task' && action.title) {
      addTask({
        title: action.title,
        priority: action.priority || 'p2',
        category: 'Work',
        done: false,
        column: 'today',
        agentBadge: 'Whiteboard',
      });
      taskCount++;
    } else if (action.type === 'journal' && action.body) {
      const s = getState();
      setState({
        journalEntries: [
          { id: `j-wb-${Date.now()}`, date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), text: action.body },
          ...s.journalEntries,
        ],
      });
      journalCount++;
    }
  }

  if (taskCount + journalCount > 0) await persistNow();

  return { tasks: taskCount, journal: journalCount };
}
