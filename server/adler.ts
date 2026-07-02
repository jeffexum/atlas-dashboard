// server/adler.ts — Adler, your personal coach agent

import Anthropic from '@anthropic-ai/sdk';
import { getState, setState, persistNow } from './state.js';
import { ASSISTANT_TOOLS, executeTool } from './tools.js';

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
- Match Jeff's voice exactly — see the USER PROFILE section for his communication and management style. Short, casual, direct, "Cheers, Jeff" sign-off.
- For anything consequential, prefer create_draft so Jeff can review on the dashboard. Send directly only when Jeff explicitly says to send.
- If a draft needs deeper work, use workshop_draft to pull it into the Whiteboard.

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
  const TZ = 'America/Denver';
  const hour = parseInt(now.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }), 10);
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ });

  const recentMemory = s.adlerMemory.slice(-12);

  const taskLines = s.tasks.map((t) =>
    `  [${t.id}] ${t.priority.toUpperCase()} ${t.column}${t.done ? ' ✓' : ''} | ${t.category} | "${t.title}"`
  );

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

HEALTH — Oura Ring, last 3 days (most recent last):
${s.health.slice(-3).map((h) => `  ${h.date}: sleep ${h.sleepHours ?? '?'}h (score ${h.sleepScore ?? '?'}, deep ${h.deepHours ?? '?'}h, REM ${h.remHours ?? '?'}h), readiness ${h.readinessScore ?? '?'}, HRV ${h.hrv ?? '?'}, resting HR ${h.restingHR ?? '?'}, steps ${h.steps ?? '?'}`).join('\n') || '  no data synced'}

USER PROFILE — Jeff's communication & management style (match this in every draft):
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
      model: 'claude-sonnet-4-6',
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

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Denver' });

  const prompt = `Today is ${dateStr}. You are Adler. Below is the complete current state of Jeff's world — inbox with email excerpts, pending drafts, both calendars (work Outlook + personal Gmail), tasks, habits, goals, your memory of him.

${buildContext()}

Review everything above like a chief of staff and write Jeff's daily briefing — the first thing he sees on his dashboard.

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
      model: 'claude-sonnet-4-6',
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
