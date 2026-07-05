// server/adler.ts — Adler, your personal coach agent

import Anthropic from '@anthropic-ai/sdk';
import { USER } from './config.js';
import { getState, setState, persistNow } from './state.js';
import { ASSISTANT_TOOLS, executeTool } from './tools.js';
import { MODELS } from './models.js';

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
- You have full access to their dashboard: tasks, habits, goals, inbox (with email bodies), both calendars (work Outlook + personal Gmail), drafts, books, ideas, journal.
- You can add tasks, log habits, update goals, sync data. Use these tools when it makes sense — don't ask permission for small things.
- Never be sycophantic. If they're behind on things, say so honestly.

EMAIL RULES (important):
- When responding to an email that exists in the inbox, ALWAYS use reply_to_email (in-thread) — never send_email, which starts a new thread. Use replyAll when others were on the original.
- Match ${USER.firstName}'s voice exactly — see the USER PROFILE section for their communication and management style, including the "${USER.signoff}, ${USER.firstName}" sign-off.
- For anything consequential, prefer create_draft so ${USER.firstName} can review on the dashboard. Send directly only when ${USER.firstName} explicitly says to send.
- If a draft needs deeper work, use workshop_draft to pull it into the Whiteboard.

DUE DATES & SCHEDULING:
- Tasks can carry due dates. When ${USER.firstName} mentions a deadline, set dueDate on the task.
- When a task is due within 2 days (or overdue) and has no matching calendar event, proactively suggest scheduling it: offer 1-2 SPECIFIC time slots from FREE TIME SLOTS (never invent slots). If ${USER.firstName} picks one, add_calendar_event immediately.

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

function buildContext(): string {
  const s = getState();
  const now = new Date();
  // Server runs in UTC — everything time-related must be Denver local
  const TZ = USER.tz;
  const hour = parseInt(now.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }), 10);
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ });

  const recentMemory = s.adlerMemory.slice(-12);

  const todayStr = now.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
  const dueFlag = (d?: string) => {
    if (!d) return '';
    const days = Math.round((new Date(`${d}T12:00:00`).getTime() - new Date(`${todayStr}T12:00:00`).getTime()) / 86_400_000);
    if (days < 0) return ` | due ${d} ⚠️ OVERDUE by ${-days}d`;
    if (days === 0) return ` | due TODAY ⚠️`;
    if (days <= 2) return ` | due ${d} (in ${days}d — due soon)`;
    return ` | due ${d}`;
  };
  const taskLines = s.tasks.map((t) =>
    `  [${t.id}] ${t.priority.toUpperCase()} ${t.column}${t.done ? ' ✓' : ''} | ${t.category} | "${t.title}"${dueFlag(t.dueDate)}`
  );

  // Free gaps (≥1h, 8am–6pm Denver) across BOTH calendars for today + next 2 days
  const fmtH = (h: number) => {
    const hr = Math.floor(h); const m = h % 1 ? ':30' : '';
    return hr === 12 ? `12${m}pm` : hr > 12 ? `${hr - 12}${m}pm` : `${hr}${m}am`;
  };
  const todayNum = parseInt(now.toLocaleDateString('en-US', { day: 'numeric', timeZone: TZ }), 10);
  const curHour = parseInt(now.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }), 10);
  const gapLines: string[] = [];
  for (let offset = 0; offset < 3; offset++) {
    const d = todayNum + offset; // fine within a month; cross-month days simply won't match events
    const evts = s.calEvents
      .filter((e) => e.date === d && !e.title.startsWith('📅')) // ignore all-day banners
      .sort((a, b) => a.start - b.start);
    let cursor = offset === 0 ? Math.max(8, curHour + 1) : 8;
    const gaps: string[] = [];
    for (const e of evts) {
      if (e.start - cursor >= 1) gaps.push(`${fmtH(cursor)}–${fmtH(e.start)}`);
      cursor = Math.max(cursor, e.start + e.duration);
    }
    if (18 - cursor >= 1) gaps.push(`${fmtH(cursor)}–${fmtH(18)}`);
    if (cursor <= 18 || gaps.length) {
      gapLines.push(`  ${offset === 0 ? 'Today' : `The ${d}th`}: ${gaps.join(', ') || 'fully booked (8am–6pm)'}`);
    }
  }

  const habitLines = s.habits.map((h) =>
    `  [${h.id}] ${h.completedToday ? '✓' : '○'} ${h.name} — ${h.streak}🔥 streak (${h.rate}% rate)`
  );

  const commLines = s.comms.filter((c) => c.status === 'open').slice(0, 20).map((c) =>
    `  [${c.id}] ${c.priority.toUpperCase()} from ${c.who} <${c.email || '?'}>: "${c.subject}"\n    ${(c.body || c.preview).slice(0, 400).replace(/\n/g, ' ')}`
  );

  const draftLines = s.drafts.filter((d) => d.status === 'ready').map((d) =>
    `  [${d.id}] to ${d.to}, re: "${d.re}"${d.commId ? ' (in-thread reply)' : ' (new email)'}\n    ${d.text.slice(0, 200).replace(/\n/g, ' ')}`
  );

  const today = parseInt(now.toLocaleDateString('en-US', { day: 'numeric', timeZone: TZ }), 10);
  const calLines = s.calEvents
    .filter((e) => e.date >= today && e.date <= today + 7)
    .sort((a, b) => a.date - b.date || a.start - b.start)
    .slice(0, 25)
    .map((e) => `  ${e.date}th ${Math.floor(e.start)}:${e.start % 1 ? '30' : '00'} — ${e.title} [${e.source === 'personal' ? 'Personal/Gmail' : 'Work/Outlook'}]`);

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

INBOX — open emails with excerpts (use exact IDs for reply_to_email / read_email / snooze_comm / add_todo_from_comm):
${commLines.join('\n') || '  none'}

PENDING DRAFTS (use exact IDs for send_draft / discard_draft / workshop_draft):
${draftLines.join('\n') || '  none'}

CALENDAR — next 7 days, both work and personal:
${calLines.join('\n') || '  nothing scheduled'}

FREE TIME SLOTS (≥1h, 8am–6pm, both calendars considered):
${gapLines.join('\n') || '  none in the next 3 days'}

SHOPPING LIST (use exact IDs for check_shopping_item / remove_shopping_item):
${s.shopping.filter((i) => !i.done).map((i) => `  [${i.id}] ${i.category}: ${i.name}${i.addedBy && i.addedBy !== USER.firstName ? ` (added by ${i.addedBy})` : ''}`).join('\n') || '  empty'}

HEALTH — Oura Ring, last 3 days (most recent last):
${s.health.slice(-3).map((h) => `  ${h.date}: sleep ${h.sleepHours ?? '?'}h (score ${h.sleepScore ?? '?'}, deep ${h.deepHours ?? '?'}h, REM ${h.remHours ?? '?'}h), readiness ${h.readinessScore ?? '?'}, HRV ${h.hrv ?? '?'}, resting HR ${h.restingHR ?? '?'}, steps ${h.steps ?? '?'}`).join('\n') || '  no data synced'}

USER PROFILE — ${USER.firstName}'s communication & management style (match this in every draft):
${s.userProfile ? s.userProfile.slice(0, 3000) : '  (not learned yet — run learn_style)'}

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

  try {
    appendMemory('user', userMessage);
  } catch (err) {
    console.error('appendMemory error:', err);
    throw err;
  }

  let system: string;
  try {
    system = `${ADLER_SYSTEM}\n\n${buildContext()}`;
  } catch (err) {
    console.error('buildContext error:', err);
    throw err;
  }

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

  // Agentic loop — keep going until stop_reason is 'end_turn' (no more tool calls)
  for (let i = 0; i < 8; i++) {
    const response = await getClient().messages.create({
      model: MODELS.standard,
      max_tokens: 2048,
      system,
      tools: ASSISTANT_TOOLS,
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
        const result = await executeTool(block.name, block.input as Record<string, unknown>);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
    }

    if (toolResults.length === 0) break;
    await persistNow();
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

// ── Partner Adler (Lacy) ──────────────────────────────────────────────────────
// A scoped assistant for Jeff's partner: sees his schedule/tasks/habits, can add
// todos, calendar events, and leave notes — but never sees email contents,
// drafts, the style profile, or Adler's private memory of Jeff.

const PARTNER_TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_task',
    description: "Add a task to the user's to-do list",
    input_schema: { type: 'object' as const, properties: { title: { type: 'string' }, priority: { type: 'string', enum: ['p1', 'p2', 'p3'] } }, required: ['title'] },
  },
  {
    name: 'add_calendar_event',
    description: "Add an event to the user's Atlas calendar",
    input_schema: { type: 'object' as const, properties: { title: { type: 'string' }, start: { type: 'number', description: 'Start hour as decimal (e.g. 18.5 = 6:30pm)' }, duration: { type: 'number' }, date: { type: 'number', description: 'Day of month' } }, required: ['title', 'start', 'duration', 'date'] },
  },
  {
    name: 'leave_note',
    description: 'Leave a note for the user — their assistant will surface it in briefings and conversations',
    input_schema: { type: 'object' as const, properties: { note: { type: 'string' } }, required: ['note'] },
  },
];

function buildPartnerContext(): string {
  const s = getState();
  const now = new Date();
  const TZ = USER.tz;
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ });
  const today = parseInt(now.toLocaleDateString('en-US', { day: 'numeric', timeZone: TZ }), 10);

  const calLines = s.calEvents
    .filter((e) => e.date >= today && e.date <= today + 7)
    .sort((a, b) => a.date - b.date || a.start - b.start)
    .slice(0, 25)
    .map((e) => `  ${e.date === today ? 'TODAY' : `the ${e.date}th`} ${Math.floor(e.start)}:${e.start % 1 ? '30' : '00'} — ${e.title} (${e.source === 'personal' ? 'personal' : 'work'})`);

  const taskLines = s.tasks.filter((t) => !t.done).map((t) => `  [${t.priority.toUpperCase()}] ${t.title}${t.agentBadge ? ` (${t.agentBadge})` : ''}`);
  const habitLines = s.habits.map((h) => `  ${h.completedToday ? '✓' : '○'} ${h.name} — ${h.streak}-day streak`);
  const openEmails = s.comms.filter((c) => c.status === 'open').length;

  return `CURRENT TIME: ${timeStr} on ${dateStr} (Denver)

JEFF'S CALENDAR — next 7 days:
${calLines.join('\n') || '  nothing scheduled'}

JEFF'S OPEN TASKS:
${taskLines.join('\n') || '  none'}

JEFF'S HABITS TODAY:
${habitLines.join('\n') || '  none tracked'}

INBOX: ${openEmails} open work emails (contents are private — you can share the count only)

NOTES ALREADY LEFT FOR JEFF:
${s.adlerNotes['partner_notes'] || '  none'}`;
}

export async function runPartnerAdler(userMessage: string, partnerName: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return 'ANTHROPIC_API_KEY not configured.';

  const system = `You are ${USER.assistant}, ${USER.name}'s personal assistant. Right now you are talking to ${partnerName}, ${USER.firstName}'s partner — a warm, trusted person in their life.

WHAT YOU CAN DO FOR ${partnerName.toUpperCase()}:
- Answer questions about ${USER.firstName}'s day, schedule (work and personal calendars), tasks, and habit streaks
- Add tasks to his to-do list (tag ideas: use the add_task tool; they'll show as "From ${partnerName}")
- Add events to his calendar
- Leave notes that ${USER.firstName}'s briefing will surface

PRIVACY RULES (firm):
- Never share the contents, senders, or subjects of ${USER.firstName}'s emails — you may only mention how many are open
- Never share ${USER.firstName}'s drafts, their communication-style profile, or private memory
- If asked for something outside your scope, say warmly that it's outside what you can share

TONE: friendly and helpful, like a family assistant. Keep replies short — a few sentences.

${buildPartnerContext()}`;

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

  for (let i = 0; i < 5; i++) {
    const response = await getClient().messages.create({
      model: MODELS.cheap,
      max_tokens: 1024,
      system,
      tools: PARTNER_TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock?.type === 'text' ? textBlock.text : 'Done.';
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const input = block.input as Record<string, unknown>;
      let result = 'ok';
      if (block.name === 'add_task') {
        result = await executeTool('add_task', { title: input.title, priority: input.priority || 'p2', category: 'Personal' });
        // Re-badge so Jeff sees who added it
        const s = getState();
        setState({ tasks: s.tasks.map((t, i2) => i2 === s.tasks.length - 1 ? { ...t, agentBadge: `From ${partnerName}` } : t) });
      } else if (block.name === 'add_calendar_event') {
        result = await executeTool('add_calendar_event', { ...input, category: 'Personal' });
      } else if (block.name === 'leave_note') {
        const s = getState();
        const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: USER.tz });
        const existing = s.adlerNotes['partner_notes'] || '';
        setState({ adlerNotes: { ...s.adlerNotes, partner_notes: `${existing}\n[${stamp}] ${partnerName}: ${input.note}`.trim() } });
        result = `Note saved — ${USER.firstName}'s ${USER.assistant} will surface it.`;
      }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }
    if (toolResults.length === 0) break;
    await persistNow();
    messages.push({ role: 'user', content: toolResults });
  }

  return 'Done.';
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
- Any time: if a task is due within 2 days (or overdue) and nothing on the calendar covers it, reach out ONCE with 1-2 specific free slots from FREE TIME SLOTS to schedule it (e.g. "The consulting contract is due tomorrow — want me to block 10–11am or 2–3pm for it?")
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
      model: MODELS.cheap,
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

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: USER.tz });

  const prompt = `Today is ${dateStr}. You are Adler. Below is the complete current state of ${USER.firstName}'s world — inbox with email excerpts, pending drafts, both calendars (work Outlook + personal Gmail), tasks, habits, goals, your memory of him.

${buildContext()}

Review everything above like a chief of staff and write ${USER.firstName}'s daily briefing — the first thing he sees on his dashboard.

The briefing paragraph (3-6 sentences, Adler's voice: direct, warm, zero fluff):
- Which emails actually need a reply from him today, by name — and which can wait
- What's on TODAY's calendar (both work and personal), calling out conflicts or tight transitions
- The single most important thing to get done today and why
- Anything pending (drafts awaiting review, streaks at risk) worth a mention

Then 3-5 short action chips (under 6 words each) for the concrete next actions.

Respond with JSON only:
{
  "briefingText": "the paragraph",
  "nudges": ["chip 1", "chip 2", "chip 3"]
}`;

  try {
    const response = await getClient().messages.create({
      model: MODELS.standard,
      max_tokens: 1024,
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
