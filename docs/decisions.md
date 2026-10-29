# Decisions log

Per `01-TRD.md` §"How to use this file": every ambiguity resolved with an assumption is recorded here.

| # | Date | Decision | Why | Alternatives |
|---|---|---|---|---|
| D1 | 2026-10-30 | Next.js 15 (pinned `^15.5`) instead of the `latest` scaffold (Next 16) | `01-TRD.md` §1 says "Next.js 15"; PRD gives TRD precedence on implementation | Next 16 (migration risk mid-hackathon) |
| D2 | 2026-10-30 | **No provider API keys**: all engine adapters are contract-tested against hand-authored fixtures built from current official API docs; a deterministic `mock` engine (gated by `ENABLE_MOCK_ENGINE`) powers the live demo | User constraint for this session | Recorded real fixtures (needs keys) |
| D3 | 2026-10-30 | Local Postgres in Docker (`localhost:54322/citegap`) instead of Supabase cloud | User chose local-first; no Supabase account yet | Supabase CLI local stack (heavier) |
| D4 | 2026-10-30 | Auth = thin cookie-session stub implementing the same `auth.uid()` contract Supabase Auth provides; RLS policies from `04-Backend-Schema.md` are installed unchanged and verified via `set local request.jwt.claims` in tests | Keeps RLS honest while cloud-free; swap to Supabase Auth = one file | Full Supabase Auth locally |
| D5 | 2026-10-30 | LLM gap analysis (`analyze-gap.ts`) runs behind an `llm()` wrapper with a **deterministic rule-based fallback** that derives gaps from the feature diff table; used when no provider key is present | Demo must produce fix reports without keys | Skip fix reports in demo |
| D6 | 2026-10-30 | npm (not pnpm) | pnpm not installed on this machine | install pnpm |
| D7 | 2026-10-30 | Adapters use plain `fetch` (undici) rather than provider SDKs | TRD calls for a "thin wrapper"; fewer deps, fewer breakages; SDKs add little for 4 one-shot calls | Provider SDKs |
| D8 | 2026-10-30 | Gemini adapter is P1 and behind a capability flag; fixtures only | Cut list priority ③; no key available | full implementation |
| D9 | 2026-10-30 | Seed/demo workspace is a separate workspace with `name` prefixed `[DEMO]` and its runs triggered `trigger='schedule'` with a `demo` marker in `system_prompt` column | `04-Backend-Schema.md` §8 wants clear demo labeling; schema has no meta field and must not be renamed — `system_prompt` is unused by seeded runs so it doubles as the marker | add column (forbidden) |
| D10 | 2026-10-30 | `docs` spec files live in `/docs` at repo root (TRD §3 repo layout) | original flat files moved | keep flat |
