# 06 — PRD: CiteGap (working name)

> **How to use this file:** Paste into a coding/planning agent as the authoritative product spec. Where this conflicts with any other file, **this PRD wins on scope and behavior**; the TRD wins on implementation. Keywords MUST / SHOULD / MAY are binding. Do not invent features outside this document.

## 1. One-liner
CiteGap shows a SaaS team **which exact pages AI assistants cite** for the questions their buyers ask, **which competitor page beat them**, and **what to change on their page**, then re-checks to verify the fix worked.

## 2. Problem
- Buyers now ask ChatGPT / Claude / Perplexity "best X for Y", "X pricing", "X vs Y", "how do I do Z with X". The answer cites a handful of URLs. If yours is not one of them, you lose the shortlist before a click happens.
- Existing AI-visibility tools report a **site-level score** or "brand mentioned N times". They do not say: *which prompt, which engine, which competitor URL won, which of my pages should have won, and what is different about them.*
- Enterprise tools are priced out of reach for solo founders and lean teams.
- Citations rotate quickly, so a one-time look is useless; repeated sampling is required.

## 3. Target users
| Persona | Situation | Wants | Will pay |
|---|---|---|---|
| **Solo SaaS founder** | Owns everything; sees ChatGPT referrals in analytics | "Tell me which page to fix this weekend" | $39/mo |
| **Lean growth lead (2–5 person team)** | Owns pricing/comparison pages, reports to a CEO | Evidence for a content roadmap; weekly deltas | $99/mo |
| **Product marketer** | Owns /pricing, /compare/*; fights SEO for resources | Proof competitor pages win + exact gaps | $99/mo or $149 audit |

**Not the user (MVP):** enterprises, agencies managing 50 clients, B2C brands.

## 4. Core loop (product spine)
`ASK` (prompts) → `DETECT` (who got cited) → `DIAGNOSE` (page-level gap vs winner) → `FIX` (prioritized checklist + suggested copy) → `VERIFY` (re-run, mark win/no-win).
Every feature MUST serve one of these five verbs. Anything else is cut.

## 5. Goals / Non-goals
**Goals (MVP):** exact-URL citation tracking across ≥3 engines; page-type breakdown (/pricing, /docs, /comparison); repeated scheduled checks; per-prompt fix report; public interactive sample report; paid pilots.
**Non-goals (MUST NOT build):** a single "AI visibility score" as the headline metric; sentiment analysis; auto-publishing content to the user's CMS; scraping consumer chat UIs; enterprise SSO/RBAC; a content-generation suite; share-of-voice for brand mentions without URLs.

## 6. Success metrics
**Pilot validation (the real test):**
- 10–15 paid pilots in 4 weeks post-MVP.
- ≥60% of pilots mark ≥1 fix item as done within 14 days.
- ≥40% run a second cycle (re-check after implementing).
- ≥1 documented "verified win" (own URL newly cited after a fix) per 3 pilots.
**Funnel:** sample report → signup ≥ 12%; signup → first run completed ≥ 70%; first run → paid ≥ 15%.
**Unit economics guardrail:** provider cost per workspace per month ≤ 35% of plan price.

## 7. Features and acceptance criteria

### P0 — must exist for the hackathon demo
**F1. Public sample report.** Input: a domain. Output within 90 s: pages discovered by type, 8 auto-generated prompts, results on ≥2 engines, which page types are missing from answers, top 3 competitor URLs that beat you, one teaser fix.
- *Given* a valid domain, *when* submitted, *then* progress streams live and the final report renders without signup.
- *Given* the same domain within 7 days, *then* the cached report is returned instantly.
- Full fix report and history are gated behind signup.

**F2. Onboarding.** Add own domain, ≤5 competitor domains, and prompts (paste, or auto-generate from homepage + sitemap). MUST finish in ≤3 minutes.

**F3. Prompt library.** CRUD prompts; each has an `intent` (pricing | docs | comparison | alternatives | howto | brand). Plan limits enforced.

**F4. Check runs.** Manual "Run now" + scheduled (weekly default). Each (prompt × engine) stores answer text, **cited** URLs, **retrieved-but-not-cited** URLs where the provider exposes them, search queries the engine issued, timestamp, model version.
- Partial failure (one engine down) MUST NOT fail the run; show "3/4 engines".

**F5. Citation dashboard.** For a date range: own vs competitor citation rate by engine × page type; "Lost prompts" list (competitor cited, you not); exact URLs everywhere (copyable, link out).

**F6. Prompt detail.** Per engine: the full answer with citations highlighted inline, ordered URL list, own/competitor tagging.

**F7. Fix report (the product).** For a lost prompt: (a) winner URL(s), (b) your best matching page or "no matching page exists", (c) deterministic gap checks, (d) LLM-written gap analysis grounded in the two pages' extracted text, (e) prioritized fix items with severity + effort (S/M/L) + suggested copy/structure, (f) disclaimer that findings are evidence-based differences, **not guaranteed causes**.

### P1 — build if time allows / right after hackathon
- **F8. Fix tracking + verification:** mark item done → next run flags "verified win" / "not yet cited".
- **F9. Trends:** 4/8/12-week citation rate lines; volatility (how much cited sets churn between runs).
- **F10. Weekly email digest** (Resend): wins, losses, top fix.
- **F11. Billing:** Stripe Checkout, plan gating, one-time audit that credits toward subscription.
- **F12. Multi-sample runs:** n=3 samples per (prompt, engine) for audits to report citation *probability*, not a single roll.

### P2 — later
Slack alerts, public share links for reports, Chrome extension, API, team seats, Gemini/Copilot engines, llms.txt generator.

## 8. Honesty & product-integrity requirements (MUST)
1. Label data source: "API-grounded web search; approximates, does not exactly replicate, the consumer app." Show engine + model + timestamp on every result.
2. Single samples are noisy. UI MUST show sample count and avoid language like "AI always cites…".
3. Fix recommendations MUST be framed as "differences vs the page that was cited", never "this will get you cited".
4. Do not display market stats in the product unless sourced with a link. (Statistics in the original pitch are unverified; keep them out of copy until verified.)

## 9. Packaging & pricing (decided; adjust only with evidence)
| Plan | Price | Prompts | Engines | Competitors | Cadence | Fix reports |
|---|---|---|---|---|---|---|
| Free sample | $0 | auto 8 | 2 | auto | once/domain/7d | teaser only |
| **Starter** | **$39/mo** | 25 | 3 | 2 | weekly | 5/mo |
| **Growth** | **$99/mo** | 100 | 4 | 5 | 2×/week (+daily top-10) | unlimited |
| **One-time Audit** | **$149** (credited to any plan within 30 days) | 40 | 4 | 5 | 3 samples each, once | full PDF/HTML export |

## 10. Go-to-market
- **Wedge content:** weekly teardown posts — real prompt, real engine, real winning URL, real gap, on r/SEO, r/SaaS, r/aeo, YouTube. Each post ends with "run it on your domain" → sample report.
- **Pilot outreach:** founders who publicly complain about AI tracker pricing; indie hackers with visible /pricing + /compare pages; offer the $149 audit as the paid pilot.
- **Loop:** sample report result page has "share this teardown" with anonymized domain option.

## 11. Competitive positioning
Map ≥8 competitors in a sheet (verify each claim from their live site before using it publicly). Positioning axis: **granularity × price**.
- Site-level trackers (cheap): no page-level why.
- Enterprise suites (expensive): out of budget.
- SEO suites adding AI modules: breadth over depth, unclear page-type diagnosis.
**CiteGap claims only:** exact prompt + exact URL + exact competitor + page-type breakdown + fix checklist + verification loop.

## 12. Risks
| Risk | Mitigation |
|---|---|
| API results ≠ consumer UI | Disclose; offer periodic manual spot-check guidance |
| Provider cost blows margin | Hard per-workspace budget cap, caching, plan limits (TRD §9) |
| Noise makes diagnosis look arbitrary | Multi-sample audits; show evidence side-by-side; avoid causal claims |
| Incumbents ship page-level view | Speed, verification loop, price, teardown content moat |
| Providers change response formats | Adapter layer + recorded fixtures + contract tests |
| Fetching pages triggers bot blocks | Identified UA, rate limits, graceful "could not fetch" finding |

## 13. Hackathon definition of done
A judge can: enter a real SaaS domain on the landing page → watch live progress → see a page-type × engine matrix with exact URLs → open one lost prompt → see the winner page vs their page with ≥5 concrete gaps → see a prior-run comparison (seeded) proving the verify loop.
