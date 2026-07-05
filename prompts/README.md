# Prompt Registry (Phase A.5)

All production prompts are version-controlled in this repo as TypeScript template
literals (they interpolate live state, so extraction to static files would require
a template engine for no auditability gain). This registry is the index — any
prompt change must appear in a diff to one of these locations.

| Prompt | Purpose | Location | Model tier |
|---|---|---|---|
| ADLER_SYSTEM + buildContext() | Telegram assistant persona + full context | `server/adler.ts` | standard |
| PROACTIVE_SYSTEM | proactive outreach decision | `server/adler.ts` | cheap |
| generateBriefing() prompt | daily briefing | `server/adler.ts` | standard |
| runPartnerAdler() system | partner-scoped assistant | `server/adler.ts` | cheap |
| buildSystemPrompt() | Whiteboard assistant | `server/whiteboard.ts` | standard |
| extractAndApply() prompt | Save-to-Atlas extraction | `server/whiteboard.ts` | cheap |
| scoreEmailsWithAI() prompt | email triage (actionable vs not) — measured by /api/eval | `server/outlook.ts` | cheap |
| learnUserProfile() prompt | style/management profile from sent mail | `server/outlook.ts` | critical |
| drafts/reply prompt | email reply drafting | `server/index.ts` | critical |
| drafts/:id/refine prompt | draft revision per instruction | `server/index.ts` | critical |
| knowledge distillation prompt | uploaded doc → memory section | `server/index.ts` | standard |
| extractDelegations() prompt | commitment extraction | `server/delegations.ts` | cheap |
| ASSISTANT_TOOLS descriptions | tool-triggering behavior | `server/tools.ts` | n/a |

Changelog discipline: prompt edits get their own commit with a `prompt:` prefix.
