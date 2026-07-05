# Project Plan: Atlas — Whole-Life OS (reconciled July 2026)
Companion to `02-product-spec.md`. Original draft's Phase 2 (multi-tenant) and Phase 3 (concierge)
are swapped per research §8.3 and Decision D-002. Items already shipped are marked ✅.

## Phase A — Harden + close gaps (now; no gate)
- [x] A.1 **Delegation tracker** ✅ 2026-07-05 — extraction live on real inbox — commitment extraction from email (work + personal), owner/due/source-link, T-1 nag via Telegram, slips escalate into briefing, one-click done
- [x] A.2 **Audit log + agent_runs cost telemetry** ✅ 2026-07-05 — Setup screen cards + /api/admin/* — every agent action logged; every model call with tokens/cost; internal $/day view, >$3/day alert
- [~] A.3 **Triage eval set** — tooling shipped 2026-07-05 (Triage Eval screen); labeling ~200 emails = Jeff's task, then measure — label ~200 real emails (labeling UI), measure Haiku precision, iterate ≥85%; brief thumbs-up/down feeds per-instance eval
- [x] A.4 **Graph webhooks + reconciliation sweep** ✅ 2026-07-05 — subscription + hourly renewal + 30-min sweep — real-time mail ingestion, subscription auto-renewal (Gmail: watch via pub/sub later; poll acceptable meanwhile)
- [x] A.5 Prompt registry in `/prompts/README.md` ✅ 2026-07-05 (prompts stay in code; registry indexes every one)
- ✅ Model router/tiering · ✅ Approval queue (drafts) · ✅ Morning brief · ✅ Deployable instance template + setup wizard · ✅ Instance auth
- **CHECKPOINT:** Jeff uses brief + delegations daily for 2 weeks and reports net time saved.

## Phase B — Validate (Jeff; parallel with A)
- [ ] B.1 Path decision: internal / side business / spin-out (research §7.2)
- [ ] B.2 [VERIFY] web-search pass on competitive claims (one Claude session)
- [ ] B.3 8–10 interviews with high-performer peers (any email stack). Script adjusted whole-life: "what slipped last month — work or home?"
- [ ] B.4 2 concierge candidates at $99/mo
- [ ] B.5 Name check + domain + one-pager (delegation-led, whole-life retention story)
- **CHECKPOINT:** ≥3 unprompted delegation-pain quotes AND 2 paid commits → Phase C. Else stop at A (better internal tool).

## Phase C — Concierge on dedicated instances (gate: B)
- [ ] C.1 Deploy concierge #1/#2 from render.template.yaml; onboarding = Setup wizard + 30-min call
- [ ] C.2 Weekly usage ritual: brief-open rate, approvals/day, delegations closed; 15-min weekly call each
- [ ] C.3 Per-instance voice tuning + brief feedback loop
- [ ] C.4 CSV/manual KPI entry (cash, revenue) if pulled by users
- **CHECKPOINT:** both open the brief ≥4 days/week in weeks 4–6 AND "very disappointed" without it. Kill criteria research §8.4.

## Phase D — Sellable v1 (gate: C)
- [ ] D.1 Multi-tenant foundation (Postgres, tenant isolation + CI cross-tenant test, SSO: Entra + Google)
- [ ] D.2 Stripe billing (exec $249/mo anchor; validate in C)
- [ ] D.3 Meeting prep packs; escalation router v1; weekly business review narrative
- [ ] D.4 KPI connectors (Zendesk/HubSpot as pulled)
- [ ] D.5 Security posture doc; SOC 2 decision on first blocked deal
- [ ] D.6 10 design partners; support runbook compatible with Jeff-runs-Exum
- **CHECKPOINT:** 10 paying, <2 support hrs/wk, 0 churn over 60 days → scale path decision.

## Phase E — Scale options (gate: D) — unchanged from original (AppSource/Teams app, trust-tiered sending, board packs, finance connectors, multi-exec, hire/spin-out).

## Standing weekly loop + risk table: unchanged from original draft (03), with one edit — "Copilot ships it" risk now also mitigated by whole-life scope, which Copilot structurally won't cover.
