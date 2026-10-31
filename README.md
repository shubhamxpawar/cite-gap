# CiteGap

CiteGap shows a SaaS team **which exact pages AI assistants cite** for the questions their buyers ask, **which competitor page beat them**, **what to change on their page**, and then re-checks to verify the fix worked.

Built from the specs in [`docs/`](./docs): TRD, app flow, UI/UX, backend schema, implementation plan and PRD.

## Stack

- Next.js 15 (App Router, server actions, SSE progress)
- Postgres (local embedded instance, Drizzle ORM)
- Inngest functions — run in-process in this repo when no Inngest keys are set (see [D11](./docs/decisions.md))
- Tailwind CSS 4, neo-brutalist design system from `docs/03-UI-UX-Design.md`
- Vitest for pipeline/engine contract tests

## Run it locally

Prerequisites: Node 20+, npm. No Docker, no API keys, no cloud account.

```bash
npm install

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
| `npm run test` | Vitest suite |
| `npm run lint` | ESLint |

## Mock mode (important)

This build ships **without provider API keys**. In that state:

- the deterministic **mock engine** powers every ChatGPT/Perplexity/Claude/Gemini call, and
- the app shows a yellow banner: *“Demo mode: no provider key configured — engine answers are synthetic.”*

Every sample report also carries `mock: true`. Treat the citations as a walkthrough of the product, not as real AI visibility data. Set the keys in `.env` (`OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, …) and the real adapters are selected automatically; missing keys simply disable that engine.

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
- Inngest runs in-process unless `INNGEST_EVENT_KEY` / `INNGEST_DEV_SERVER=1` is set ([D11](./docs/decisions.md)).
- Findings are evidence-based differences between pages, **not guarantees of citation**.
