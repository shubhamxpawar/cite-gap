# CiteGap — Full P0 Build Plan (Phases 0–5)

Build per the 6 spec docs. **Constraints from your answers:** no provider API keys (all engine adapters tested against fixtures, demo runs on a mock engine), local-first infra (no cloud accounts), skills installed first. Every deviation from the docs gets recorded in `/docs/decisions.md` as the TRD requires.

## Phase 0 — Setup + skills install
1. Install skills globally: `npx skills add vercel-labs/agent-skills@react-best-practices`, `@web-design-guidelines`, `@composition-patterns`, `supabase/agent-skills@supabase-postgres-best-practices`, `supabase/agent-skills@supabase`, `shadcn/ui@shadcn` (all 100K+ installs, official sources; verified via skills.sh leaderboard — no credible high-install skills exist for Drizzle/Inngest/Stripe, so those follow official docs directly).
2. `git init` + scaffold Next.js 15 (TS, App Router, Tailwind v4) in this directory; move the six spec docs into `/docs/`; shadcn init, Drizzle, Vitest, ESLint/Prettier. Create `/docs/decisions.md`.
3. `.env.example` from TRD §13; app boots with all optional keys missing (engines auto-disable, UI hides chips with tooltip).
4. `/docs/unit-economics.md` cost-math stub filled with published per-call prices and the mock-mode caveat.

## Phase 1 — Database (local-first)
- Postgres via Docker (or Supabase CLI local stack if Docker is present). Run the SQL from `04-Backend-Schema.md` §2–§5 **verbatim** (enums, tables, RLS, views `v_citation_matrix` / `v_lost_prompts`).
- Drizzle schema mirroring it + typed query helpers from §6: `getDashboardSummary`, `getLostPrompts`, `getPromptDetail`, `getPageHistory`, `getFixReport`, `getVerifiedWins`.
- Auth: Supabase Auth if the local Supabase stack runs; otherwise a thin cookie-session stub behind the same `auth.uid()` interface so RLS policies still hold (swapping to Supabase Auth later is one file). Decision logged.

## Phase 2 — Engine layer (fixture-driven, no keys)
- `engines/types.ts` exactly per TRD §4. Typed errors `RateLimited | Timeout | ProviderDown | BadResponse`; cost calc from `ENGINE_COST` table.
- Adapters `openai.ts`, `anthropic.ts`, `perplexity.ts`, `gemini.ts` written against current official API docs. **No-key adjustment:** fixtures are hand-authored from documented response shapes (marked `hand-authored` in `/docs/decisions.md` so real recorded responses can replace them later); adapter contract tests run against fixtures in CI-style Vitest.
- A `mock` engine adapter (deterministic citations across a fixture domain set) so the whole pipeline and demo run end-to-end without keys.

## Phase 3 — Normalize, classify, discover, fetch
- `normalizeUrl` (TRD §5 rules) + 20 fixtures; `classifyPage` + 40 fixtures; ownership classification.
- `discover-pages`: robots → sitemaps (cap 500) → classify; nav-link fallback.
- SSRF-safe fetcher per TRD §8 (private/loopback/metadata IP blocking, redirect re-checks, 2 MB cap, content-type allowlist) with unit tests proving `169.254.169.254` and `localhost` are rejected.

## Phase 4 — Sample report slice (the demo path)
- `sample-report` Inngest job (TRD §10): category inference → 8 prompts → run 2 engines (mock in dev) → aggregate matrix + top-3 competitor URLs + teaser. Local Inngest dev server (`npx inngest-cli dev`), no cloud account needed.
- `/api/sample` POST + SSE stream (`/api/sample/[id]/stream`), rate limit (3/day/IP-hash), 7-day hostname cache, Turnstile behind a dev feature flag.
- Landing `/` + `/sample/[id]` per UI/UX §4.1–4.2 (neo-brutalist design system, progress steps, matrix, missing pages, teaser, CTA). **Acceptance: end-to-end demo works for a real domain using mock engines.**
- Pre-warm 3 demo domains into `sample_reports`.

## Phase 5 — Workspace, runs, dashboard
- Auth flows (magic-link-style locally), workspace/profile creation, RLS verified with a cross-tenant test (user B cannot read A's rows).
- Onboarding 3 steps (domain → competitors → questions) with `sampleId` prefill and plan-limit counters.
- `run-check` + `run-prompt-engine` Inngest jobs: fan-out, idempotent step ids, concurrency limits, budget guard (`workspace_budgets`), partial-failure handling (kill an engine → run ends `partial`).
- Dashboard `/app` (4 StatCards, matrix with hover URLs, lost-prompts feed), `/app/prompts` + detail with `AnswerWithCitations`.

## Phase 6 — Fix report (the product)
- `extract-features.ts` per TRD §7.4 (robots checks, JS-rendered flag, price tokens, JSON-LD, headings) with HTML fixtures.
- Own-page candidate matcher (BM25-style overlap; null → `MISSING_PAGE`).
- `analyze-gap.ts`: zod-validated, injection-safe, ≤8 gaps. **No-key adjustment:** `llm()` wrapper gets a deterministic rule-based fallback analyzer (derives gaps from feature diffs) so reports generate without a key; the LLM path activates when `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` exists.
- `build-fix-report` merge/sort/persist; `/app/fixes/[id]` UI per UI/UX §4.6 (evidence DiffTable, fix checklist, mark-done, Re-check now, disclaimer).

## Verification
- Unit: normalizer, classifier, features, budget math. Contract: each adapter vs fixtures. Integration: fixture → DB → dashboard numbers. RLS cross-tenant denial test. E2E smoke: sample-report happy path driven via the browser-use:web-gui-tester skill.
- Seeded demo workspace (4 weekly synthetic runs + 1 verified win, clearly labeled demo data) so the "Verified wins" card isn't empty.
- Honesty labels everywhere: "API-grounded" SourceBadge, sample counts, disclaimer text — never cut per the cut list.

**Not in scope (deferred per your choice):** Stripe billing, weekly digest, `verify-fixes` job UI, Gemini redirect resolver polish, Pages/Competitors/Runs detail screens beyond stubs. The devrelay skills (mlh-submissions, publishing) remain available when you're ready to submit the hackathon project.