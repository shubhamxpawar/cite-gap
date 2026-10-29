# 05 — Implementation Plan

> **How to use this file:** Paste into a coding agent (Codex / opencode / Claude Code) with the other five files in `/docs`. Execute tasks **in order**. After each task: run tests, commit with the task ID, and verify the acceptance line. **Do not start the next task if acceptance fails.** If time is short, apply the cut list in §6 from the bottom up. Time budgets assume a 36-hour hackathon with 1–3 people; scale proportionally.

## 0. Principle: vertical slice first
By hour ~12 a visitor MUST be able to enter a domain and see a (crude) real report. Polish, billing, and email come after the slice works. A beautiful dashboard with fake data loses to an ugly end-to-end demo with real citations.

## 1. Lanes (if 3 people; solo = do in order)
- **Lane A – Pipeline:** engines, normalizer, classifier, jobs, fix-report engine.
- **Lane B – Product UI:** landing, sample report, dashboard, prompt detail, fix report.
- **Lane C – Platform/GTM:** schema/RLS, auth/onboarding, seed data, billing stub, demo script, teardown content.
Sync points: H6 (adapter contract + schema merged), H14 (slice demo), H24 (feature freeze), H30 (demo rehearsal).

## 2. Phases & tasks

### Phase 0 — Setup (H0–H2)
- **T0.1** Repo: `create-next-app` (TS, App Router, Tailwind v4), shadcn init, Drizzle, eslint, prettier, Vitest. *Accept:* `pnpm dev` + `pnpm test` pass.
- **T0.2** Supabase project, run migration from `04-Backend-Schema.md`, generate Drizzle types. *Accept:* tables exist; RLS enabled.
- **T0.3** Inngest dev server wired; one hello-world function. *Accept:* event triggers function locally.
- **T0.4** `.env.example` from TRD §13; secret check script. *Accept:* app boots with missing optional keys (engines auto-disable).
- **T0.5** **Cost math spreadsheet:** real per-call costs for each engine → fill `ENGINE_COST`, decide plan limits. *Accept:* `/docs/unit-economics.md` with Starter/Growth margins.

### Phase 1 — Engine layer (H2–H8) [Lane A]
- **T1.1** `engines/types.ts` per TRD §4. *Accept:* compiles; mock adapter passes contract test.
- **T1.2** OpenAI adapter (web_search, parse `url_citation`, queries). Record fixture. *Accept:* fixture test extracts ≥1 citation with url+title+position.
- **T1.3** Perplexity adapter (citations + search_results). Record fixture. *Accept:* position mapping from `[n]` tested.
- **T1.4** Anthropic adapter (web_search tool, cited vs retrieved). Record fixture. *Accept:* retrieved-not-cited returned as `kind:'retrieved'`.
- **T1.5** Typed errors + retry classification; per-call cost calc. *Accept:* simulated 429 → `RateLimited`.
- **T1.6** *(P1)* Gemini adapter + redirect resolver. *Accept:* real URLs resolved.

### Phase 2 — Normalize, classify, discover (H4–H10) [Lane A, parallel]
- **T2.1** `normalizeUrl` + 20 fixtures. **T2.2** `classifyPage` + 40 fixtures. *Accept:* all fixtures green.
- **T2.3** `discover-pages`: robots → sitemap(s) → classify; nav fallback; caps. *Accept:* run on 3 real SaaS domains returns typed page counts.
- **T2.4** SSRF-safe fetcher (§8 TRD) + unit tests with private-IP cases. *Accept:* `http://169.254.169.254` and `localhost` rejected.

### Phase 3 — Sample report slice (H8–H14) [A + B + C]
- **T3.1** `sample-report` Inngest job (TRD §10): category inference, 8 prompts, run 2 engines, aggregate, teaser. *Accept:* job outputs valid `result` JSON for a real domain in < 120 s.
- **T3.2** `/api/sample` + SSE stream + Turnstile (feature-flag off for dev) + rate limit + cache. *Accept:* second request same host returns cached id.
- **T3.3** Landing + `/sample/[id]` UI (UI/UX §4.1–4.2). *Accept:* **end-to-end demo works with a real domain.** ← H14 checkpoint
- **T3.4** Pre-generate sample reports for 3 real domains and store in DB as warm cache for demo. *Accept:* instant load of those 3.

### Phase 4 — Workspace & runs (H12–H20)
- **T4.1** Auth (magic link + Google), workspace creation, RLS verified with a 2-user test. *Accept:* user B cannot read user A's rows.
- **T4.2** Onboarding 3 steps incl. `sampleId` prefill. *Accept:* sample → signup → onboarding prefilled in ≤ 3 clicks.
- **T4.3** `run-check` + `run-prompt-engine` jobs, budget guard, partial-failure handling. *Accept:* kill one engine key → run ends `partial`.
- **T4.4** Persist responses/citations/pages with normalization + owner classification. *Accept:* DB rows match fixture expectations.
- **T4.5** Dashboard (4 stat cards, matrix, lost prompts feed) using views from schema §6. *Accept:* numbers equal a hand-computed fixture.
- **T4.6** Prompt detail with `AnswerWithCitations`. *Accept:* markers map to correct URLs.

### Phase 5 — Fix report (the product) (H16–H26) [Lane A + B]
- **T5.1** `extract-features.ts` (TRD §7.4) with HTML fixtures (SSR pricing page, JS-only page, docs page). *Accept:* each feature asserted.
- **T5.2** Own-page candidate matcher. *Accept:* picks `/pricing` for a pricing prompt; returns null when none.
- **T5.3** `analyze-gap.ts` with zod schema + injection-safe prompt; retry on invalid JSON once. *Accept:* never returns more than 8 gaps; every gap has evidence.
- **T5.4** `build-fix-report` merges deterministic + LLM items, sorts, persists. *Accept:* report persisted with ≥5 items on a real lost prompt.
- **T5.5** Fix report UI (UI/UX §4.6) + mark-done. *Accept:* checking item persists `done` and shows toast.
- **T5.6** **Feature freeze at H24** except bug fixes.

### Phase 6 — Loop & money (H24–H30, only if Phase 5 is solid)
- **T6.1** `verify-fixes` job + verified-win card. **T6.2** Seed demo workspace (4 weekly synthetic runs + 1 verified win; clearly labeled demo data). **T6.3** Stripe Checkout (test mode) + webhook + plan gating on prompts/competitors. **T6.4** Weekly digest via Resend (send to self). **T6.5** `/pricing` page.

### Phase 7 — Demo & submission (H30–H36)
- **T7.1** Rehearse demo ×3 with timer. **T7.2** Record backup video of full flow. **T7.3** README (problem, architecture diagram, limitations, how to run). **T7.4** Slide deck ≤ 6 slides. **T7.5** Submit early; leave 1 h buffer.

## 3. Demo script (3 minutes)
1. **0:00 Hook:** screenshot of ChatGPT recommending a competitor's pricing page for a real SaaS (use one of your pre-cached domains; get permission or use a public/own project).
2. **0:20** Enter the domain live → progress steps run (use warm cache fallback if API stalls).
3. **1:00** Matrix: "your /comparison page doesn't exist; your /pricing was never cited; here are the exact URLs that were."
4. **1:30** Open fix report: winner vs yours, 3 concrete gaps, copy a suggested snippet.
5. **2:15** Switch to demo workspace: "customer implemented two fixes → next check → verified win." (Label as demo data.)
6. **2:40** Pricing + wedge: page-level diagnosis, $39–$99, verification loop. Close with pilot plan.

## 4. Testing checklist (minimum)
Unit: normalizer, classifier, features, budget math. Contract: each adapter against fixtures. Integration: fixture → DB → dashboard numbers. RLS: cross-tenant read/write denial. E2E smoke: sample report happy path. Manual: private-IP SSRF attempt, rate-limit trip, one-engine-down run.

## 5. Risks & fallbacks
| Risk | Fallback |
|---|---|
| Provider API rate limit/outage at demo | Warm-cached reports for 3 domains + recorded video |
| Sample report > 90 s | Run 6 prompts not 8; 2 engines in parallel; stream partials |
| Fix-report LLM noisy | Lead with deterministic findings; LLM section collapsible |
| Competitor page unfetchable | Report from answer excerpt + features available; banner |
| Costs spike from public demo | Turnstile + global daily budget kill-switch + cache |
| Time overrun | §6 cut list |

## 6. Cut list (cut from the bottom)
Keep always: sample report, dashboard matrix, prompt detail, fix report. Cut in this order if behind: ① Stripe/billing → ② weekly digest → ③ Gemini → ④ verify loop UI (keep seeded screenshot) → ⑤ Pages detail/snapshots → ⑥ Competitors/Runs pages → ⑦ onboarding step polish (use a single form). Never cut: honesty labels, SSRF protection, RLS.

## 7. Post-hackathon: 2-week MVP → pilots
**Week 1:** replace seed data with real runs; multi-sample audits (n=3); Stripe live; digest; Gemini; JS-render fallback (Playwright) for competitor pages; error budget dashboard.
**Week 2:** onboarding hardening; export audit as HTML/PDF; public teardown pages; instrument funnel; fix top 10 bugs from pilot feedback.
**Pilot ops (10–15 paid):** (1) build a list of 60 SaaS founders with visible /pricing + /compare pages; (2) personalized outreach with their own sample report link; (3) sell the $149 audit; (4) 2-week follow-up: did they implement? re-run; (5) record outcomes in a sheet: implemented Y/N, verified win Y/N, returned for cycle 2 Y/N, willingness to pay for monthly. **Kill/continue rule:** if <30% implement fixes or <20% return for cycle 2 after 12 pilots, the diagnosis isn't actionable enough — revisit the fix-report quality before scaling.
**Content cadence:** 1 teardown/week: pick a public SaaS, run 5 prompts × 3 engines, post the winning URL + 3 gaps (only publicly verifiable facts), end with sample-report CTA.

## 8. Definition of done (hackathon)
Real domain → live progress → matrix with exact URLs → lost prompt → fix report with ≥5 evidence-backed items → mark done → seeded verified-win view; honesty labels visible; README + backup video ready.
