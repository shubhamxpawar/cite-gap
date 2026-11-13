# CiteGap

CiteGap shows a SaaS team **which exact pages AI assistants cite** for the questions their buyers ask, **which competitor page beat them**, **what to change on their page**, and then re-checks to verify the fix worked.

Built from the specs in [`docs/`](./docs): TRD, app flow, UI/UX, backend schema, implementation plan and PRD.

## Stack

- Next.js 15 (App Router, server actions, SSE progress)
- Postgres (local embedded instance, Drizzle ORM)
- Inngest functions — run in-process by default; real Inngest via the local dev server or cloud keys (see [D11](./docs/decisions.md))
- Tailwind CSS 4, neo-brutalist design system from `docs/03-UI-UX-Design.md`
- Vitest for pipeline/engine contract tests

## Run it locally

Prerequisites: Node 20+, npm. No Docker, no API keys, no cloud account.

```bash
npm install

# 0. local config (mock mode is on; no keys needed)
cp .env.example .env

# 1. start the embedded Postgres (localhost:54322)
node scripts/db.mjs up

# 2. apply the schema
npm run db:migrate

# 3. seed the [DEMO] workspace + warm sample reports
npm run db:seed

# 4. start Next.js
npm run dev
```

Open <http://localhost:3000>. To explore the signed-in product, go to `/login` and use **Continue as demo** (or `demo@citegap.dev`). The seeded workspace has four backdated weekly runs, 12 prompts, 12 captured pages, three fix reports and one **verified win**.

Useful scripts:

| Command | What it does |
|---|---|
| `node scripts/db.mjs up` / `down` | start / stop the embedded Postgres |
| `npm run db:migrate` | apply `scripts/migrations/*.sql` |
| `npm run db:seed` | replace the `[DEMO]` workspace and warm sample reports (idempotent) |
| `npm run dev` | Next.js dev server |
| `npm run build` | production build |
| `npm run inngest:dev` | local Inngest dev server at <http://localhost:8288> |
| `npm run test` | Vitest suite |
| `npm run lint` | ESLint |

### Real Inngest locally

By default jobs execute in-process, so no second process is needed. To exercise the
real Inngest functions:

```bash
# terminal 1
npm run dev                 # or: npm run build && npm start

# terminal 2
npm run inngest:dev         # http://localhost:8288
```

Keep `INNGEST_DEV=1` in `.env`. The dev server discovers the app at
`http://localhost:3000/api/inngest`, and the app sends events to `localhost:8288`.
If the dev server is not running, dispatch logs the failure and falls back to
in-process execution instead of dropping the run.

Cloud keys (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`) are only useful once the app
has a public URL that Inngest Cloud can reach — a tunnel or a deployed environment.
Cloud keys alone cannot process events from `localhost`.

## Mock mode (important)

This build ships **without provider API keys**. In that state:

- the deterministic **mock engine** powers every ChatGPT/Perplexity/Claude/Gemini call, and
- the app shows a yellow banner: *“Demo mode: no provider key configured — engine answers are synthetic.”*

Every sample report also carries `mock: true`. Treat the citations as a walkthrough of the product, not as real AI visibility data. Set the keys in `.env` (`OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, …) and the real adapters are selected automatically; missing keys simply disable that engine.

## Real engines and keys

Only **Gemini** has a free text tier. The other three are paid — add them only if you
accept the bill. With `ENABLE_MOCK_ENGINE=0`, only engines that have a key run, and a
run uses real engines exclusively (mocks are never mixed in).

| Engine | Env var | Tier | Key |
|---|---|---|---|
| Gemini | `GEMINI_API_KEY` | **free text tier** | <https://aistudio.google.com/apikey> |
| Tavily search | `TAVILY_API_KEY` | **free** 1,000 searches/month, no card | <https://app.tavily.com> |
| Brave search | `BRAVE_SEARCH_API_KEY` | free 2,000 queries/month | <https://brave.com/search/api/> |
| Serper search | `SERPER_API_KEY` | free 2,500 credits | <https://serper.dev> |
| OpenAI / ChatGPT | `OPENAI_API_KEY` | paid | <https://platform.openai.com/api-keys> |
| Anthropic / Claude | `ANTHROPIC_API_KEY` | paid | <https://console.anthropic.com/settings/keys> |
| Perplexity | `PERPLEXITY_API_KEY` | paid | <https://www.perplexity.ai/settings/api> |

### Why a search key is needed

Google Search grounding is **not available on the Gemini API free tier** (as of
November 2026). A free key can generate text, but it cannot browse or return citations.
CiteGap therefore pairs Gemini's free text model with a free search API: it searches,
feeds the numbered results to Gemini, and asks Gemini to cite them. Tavily is checked
first, then Brave, then Serper; if one fails or returns nothing the next is tried. Without one of those keys the adapter falls back to
native Google Search grounding, which needs a paid-tier Gemini project.

For a free but real run:

```env
GEMINI_API_KEY=...
TAVILY_API_KEY=...
ENABLE_MOCK_ENGINE=0
GEMINI_MODEL=gemini-3.5-flash-lite
```

Restart and start a new run. The free plan caps estimated spend at $2 and prompts at 8;
Tavily's free 1,000 credits/month is roughly 125 eight-prompt runs.

## What is implemented

- **Landing + public sample report** — domain input, live SSE progress, page-type × engine matrix, missing page types, top competitor URLs, teaser fix.
- **Auth + onboarding** — cookie-session stub, domain → competitors → question checklist, first run queued on finish.
- **Dashboard** — own citation rate and lost prompts vs the previous run, page type × engine matrix, lost-prompt feed with direct fix-report links, verified wins.
- **Prompts** — CRUD, per-engine last result, detail with inline citations, retrieved-not-cited, 8-run history.
- **Fix report** (hero screen) — winner vs your page, measured feature diff, deterministic gap analysis (LLM wrapper with rule-based fallback), prioritized checklist with suggested copy, mark-done and re-check loop.
- **Pages** — captured URLs, 30-day citation counts, weekly timeline, snapshot feature diffs.
- **Competitors / Runs / Settings / Pricing** — head-to-head counts, per-engine run errors, plan usage meters, plan comparison.
- **Jobs** — budget guard, per-(prompt × engine) fan-out, partial-failure tolerance, fix-report build, verification (`done` → `verified_win` / `not_yet`).

## Deploy (Synteq)

The repo ships a multi-stage `Dockerfile` (Next.js standalone) and an unauthenticated
`GET /api/health` probe that returns `200` only when Postgres is reachable. Step-by-step
runbook, env vars, migrations and the Postgres options: [`deploy/synteq.md`](./deploy/synteq.md).

```bash
docker build -t cite-gap .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgres://…' \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e ENABLE_MOCK_ENGINE=1 cite-gap
curl -s localhost:3000/api/health
```

Synteq Apps have an ephemeral filesystem and no managed database, so `DATABASE_URL` must point
at an external Postgres ([D14](./docs/decisions.md)).

## Layout

```
src/app/            routes: /, /sample/[id], /login, /signup, /onboarding, /app/*, /pricing
src/app/actions.ts  server actions (auth, onboarding, prompts, runs, fixes, competitors)
src/components/     design-system + screen components
src/server/engines/ provider adapters + deterministic mock
src/server/jobs/    Inngest functions, local dispatch, sample + fix + verify pipelines
src/server/pipeline/ URL normalization, classification, SSRF-safe fetch, extraction
src/server/db/      Drizzle schema, client, query helpers
scripts/            embedded Postgres, migrations, seed
tests/              pipeline + engine contract tests (fixtures, no keys)
docs/               product/technical specs + decisions log
```

## Tests

```bash
npm run test
```

Covers URL normalization, page classification, SSRF guard, robots parsing, feature extraction, cost math, and engine contract parsing against hand-authored fixtures in `tests/fixtures/`.

## Known limits (by design)

- No Stripe billing, email delivery or Turnstile in the local demo ([D13](./docs/decisions.md)).
- Real engines require keys; the demo runs on the mock engine ([D2](./docs/decisions.md)).
- Inngest runs in-process unless Inngest is configured: set `INNGEST_DEV=1` and run `npm run inngest:dev` for the local dev server, or set cloud keys and expose the app publicly. If the dev server is unreachable, dispatch falls back to in-process execution ([D11](./docs/decisions.md)).
- Findings are evidence-based differences between pages, **not guarantees of citation**.
