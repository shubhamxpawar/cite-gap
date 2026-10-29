# Unit economics (TRD §9 / T0.5)

> **Status: no-key session (docs/decisions.md D2).** Prices below are from public provider pricing pages (Oct 2026) and are used for the `ENGINE_COST` table and plan-limit math. Verify before any live launch.

## Per-call cost model

| Engine | Model | Search/tool cost | Avg answer tokens | Est. cost/call |
|---|---|---|---|---|
| ChatGPT | gpt-4.1-mini + web_search | tool ~$10/1k calls | ~600 out | ~$0.005–0.01 |
| Claude | claude-sonnet + web_search | $10/1k searches | ~600 out | ~$0.01–0.015 |
| Perplexity | sonar | $5–12/1k requests (tier) | included | ~$0.005–0.012 |
| Gemini | 2.0-flash + grounding | grounding $35/1k (free tier exists) | ~400 out | ~$0.01–0.04 |

Working average: **$0.01/call** across engines.

## Math that decides plan limits

Growth plan worst case: 100 prompts × 4 engines × 8 runs/mo = 3,200 calls → at $0.01 = **$32/mo vs $99 price = 32%**. Guardrail (PRD §6) is ≤35% — *tight*. Mitigations already in spec: cache identical (prompt, engine, day); daily top-10 subset instead of full matrix daily; budget cap $30 hard-stop.

Starter: 25 × 3 × 4 = 300 calls → ~$3/mo vs $39 = 8%. Comfortable.

Audit ($149): 40 prompts × 4 engines × 3 samples = 480 calls → ~$4.8. Fine.

Sample report (public): 8 prompts × 2 engines = 16 calls → ~$0.16 vs $0.30 cap. Cache per hostname (7 d) makes repeat visitors free.

## Decisions
- `ENGINE_COST` per call, conservative $0.01 default, per-provider overrides in `src/server/engines/cost.ts`.
- Budget caps: Starter $9, Growth $30, Audit $25 one-off, Sample $0.30 (TRD §9 defaults).
- With no keys, live cost is $0; the budget guard is still exercised in tests.
