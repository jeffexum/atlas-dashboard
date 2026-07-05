# Product Spec & Build Brief: Atlas — The Whole-Life OS for High Performers
**Audience:** Claude Code (and any engineer). Source of truth for productizing Atlas.
Supersedes the "CEO Command Center" framing of the original draft (see Decision Log D-001).
Read fully before any change; update Decision Log + STATUS as you work.

---

## 0. Context — CURRENT STATE (corrected July 2026; the original draft described a stack that never existed)

- **Frontend:** Vite + React SPA (not Next.js), Zustand store fed by SSE, deployed as a Render static site.
- **Backend:** Node/Express (TypeScript, NodeNext ESM) on Render. Persistence: **Upstash Redis** per-collection keys (not SQLite) — write-verified, restart-proven.
- **Assistant:** one unified tool-driven agent ("Adler") shared by Telegram and the dashboard Whiteboard.
  ~30 tools: tasks (with due dates), calendar (add + free-gap scheduling), email (read / in-thread
  reply / reply-all / send / draft / refine), habits, shopping, goals, journal, ideas, memory
  sections, knowledge docs, sync. Partner role (scoped assistant, no email access) exists.
- **Integrations live:** Outlook mail+calendar (Graph, auto-refresh, 401-retry), Gmail
  (read/score/reply/send), Google Calendar, Oura (sleep/readiness/activity), Goodreads (Kindle
  reading via RSS), Telegram bot with owner/partner roles.
- **Model tiering (done):** Haiku = triage/extraction, Sonnet = chat/briefing, Fable 5 = email
  drafting + style learning, with automatic refusal fallback. Env-overridable per instance.
- **Approval-first (done):** drafts queue with inline composer + AI refinement; nothing sends
  without explicit action, in-thread replies guaranteed.
- **Briefing (done):** Adler-authored morning brief from full context (both inboxes, both
  calendars, tasks, habits, health), regenerates on sync, 7am local, dashboard + Telegram.
- **Packaging (done):** per-instance deployment — `render.template.yaml` + `SETUP.md` + in-app
  Setup wizard (connections checklist, BotFather guide, style training, markdown knowledge
  upload). Personalization via env (USER_NAME/BIO/SIGNOFF/TZ, ASSISTANT_NAME). Optional bearer
  auth (ATLAS_SECRET).
- **Not built yet:** delegation tracker, audit log, per-run cost telemetry, triage eval set,
  Graph webhooks (currently poll/sync), Postgres, multi-tenancy, billing.

## 1. Product Direction (Decision D-001)

**Atlas is one product: everything in a high performer's life.** Work (dual inboxes, dual
calendars, delegations, briefings) and life (health, habits, reading, shopping, family/partner
assistant) in a single reasoning loop. Nothing built to date gets cut or feature-flagged away.

- **Buyer:** the individual (founder, exec, operator), even when expensed. Not IT procurement.
- **Lead story:** delegation / "get out of the critical path" — the sharpest wedge from the
  market research. The whole-life integration is the retention moat, not the headline.
- **Privacy architecture = dedicated instance per person.** Your own database, your own API, your
  health data never co-mingled. This is both the concierge vehicle and the long-term
  differentiator vs. multi-tenant assistants.
- **Ecosystem-neutral:** Outlook and Gmail are both first-class (already true). M365-native depth
  remains a differentiator, not a gate.

## 2. Product Principles
1. Human approves before anything leaves the system (v1 sends nothing autonomously; trust tiers are P2).
2. Meet the user where they live: Telegram/phone + dashboard now; Teams surface later if buyers pull.
3. Every agent action auditable (audit log = Phase A).
4. Instance isolation is the privacy story; enforce secrets hygiene per instance.
5. Cheap models for classification, frontier for drafting (done — keep the discipline).
6. Boring tech; smallest ops burden that works. Redis stays until multi-tenant reporting forces Postgres.

## 3. Feature spec deltas vs. original draft
- F1 Morning Brief: **done** (dashboard + Telegram). Add thumbs-up/down feedback → eval set (Phase A.3).
- F2 Triage + Approval queue: **done** in drafts form. Add: precision measurement vs. labeled set (A.3), keyboard-driven queue polish.
- F3 Delegation tracker: **not built — Phase A.1, top priority.** Covers work AND personal commitments ("contractor said he'd quote by Tuesday").
- F4 KPI panel: deferred to Phase D (post-validation). CSV/manual first.
- F5 Audit log: Phase A.2.
- Original non-goals amended: Gmail is IN (built). Personal features are IN (core identity).

## 4. Quality bars (unchanged in spirit)
- Cost telemetry per instance, alert > $3/day.
- Triage precision ≥85% on labeled set of ≥200 real emails.
- Prompts version-controlled in `/prompts`.
- Instance data isolation by architecture (dedicated deployments).

## 5. Loop protocol — unchanged from original draft (plan-of-record in STATUS, Decision Log for architecture choices, NEEDS JEFF for judgment calls: pricing, new OAuth scopes, third-party data flows, security posture).

## 6. Decision Log
| ID | Date | Decision | Alternatives | Rationale |
|---|---|---|---|---|
| D-001 | 2026-07-05 | Whole-life product; individual buyer; dedicated instance per person; delegation-led positioning | CEO-slice M365 SaaS (original draft) | Jeff: "everything for your life, don't lose anything we've built." Research gap #2 supports it; instance-per-person already built and doubles as privacy moat |
| D-002 | 2026-07-05 | Concierge betas run on dedicated single-tenant instances; multi-tenancy deferred to ~10 tenants | Multi-tenant foundation before beta (original plan Phase 2) | Research §8.3 says exactly this; template + wizard already exist; saves ~6 weeks pre-validation |
| D-003 | 2026-07-05 | Keep Render + Upstash Redis; revisit Postgres at multi-tenant/reporting stage | Azure migration now (original draft) | Persistence is now solid; Azure was justified by M365-only ICP which D-001 rejects |
| D-004 | 2026-07-04 | Model tiers: Haiku/Sonnet/Fable 5 with refusal fallback, env-overridable | single model | Cost + quality; Fable for outward-facing voice |

## 7. STATUS
- **2026-07-05 (later)** — Phase A build complete: A.1 delegation tracker (live, extracting from real inbox), A.2 audit+cost telemetry (briefing run tracked at $0.048), A.3 eval tooling (labeling UI ready — NEEDS JEFF: label ~200 emails, then run measurement), A.4 Graph webhooks (handshake verified) + 30-min reconciliation, A.5 prompt registry. Remaining before Phase A checkpoint: Jeff's 2-week daily-usage test.
- **2026-07-05** — Docs committed to repo with corrected current-state and D-001..D-004. Phase A begins: A.1 delegation tracker.

## 8. Open Questions — NEEDS JEFF
1. Product name: "Atlas" is a working title (heavily used trademark space) — name check in Phase B.
2. First 2 concierge candidates (whole-life framing, any email stack).
3. Pricing posture for concierge: keep $99/mo design-partner rate?
