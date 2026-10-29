# 03 — UI/UX Design

> **How to use this file:** Paste into a coding agent building the frontend. Implement the design system in §2 first (as Tailwind theme + shadcn overrides), then screens in §4 in the listed order. Every screen MUST implement loading, empty, error, and partial states. Do not add decorative elements not specified here.

## 1. Design principles
1. **Evidence over scores.** Show the exact URL, prompt, engine, and timestamp before any aggregate number. No single "AI visibility score" as hero.
2. **Own vs competitor is the primary visual axis.** Green = yours, orange/red = competitor, grey = third-party. Never use these colors for anything else.
3. **One next action per screen.** Every view ends in a clear CTA (open fix report, mark done, re-check).
4. **URLs are first-class.** Monospace, truncated in the middle, copy button, link-out icon, page-type chip.
5. **Honest uncertainty.** Show sample counts, engine/model, and "API-grounded" badge. Never imply certainty.
6. **Dense but calm.** Data tool for operators: compact tables, generous whitespace between sections.

## 2. Design system
**Style:** neo-brutalist data tool — off-white canvas, 2px black borders, hard offset shadows, flat color. (Optional dark mode is P2.)
| Token | Value |
|---|---|
| `--bg` | `#F6F3EC` |
| `--surface` | `#FFFFFF` |
| `--ink` | `#111111` |
| `--muted` | `#6B6B6B` |
| `--border` | `2px solid #111` |
| `--shadow` | `4px 4px 0 #111` (hover: `2px 2px 0`) |
| `--own` | `#1E9E5A` (bg tint `#DDF3E6`) |
| `--competitor` | `#E4572E` (bg tint `#FCE3DB`) |
| `--third` | `#8A8A8A` (bg tint `#ECECEC`) |
| `--accent` | `#FFD23F` (primary buttons, highlights) |
| `--info` | `#3A6FF7` |
| radius | `6px` |
**Type:** Headings `Space Grotesk` 700; body `Inter` 400/500; URLs, prompts, code `JetBrains Mono` 13px. Scale 12/14/16/20/28/40.
**Engine chips:** fixed brand-neutral glyph + label (ChatGPT, Claude, Perplexity, Gemini), small square badge, 1px border; disabled engines greyed with tooltip.
**Page-type chips:** `/pricing /docs /comparison /alternatives /blog /other`, mono, tinted neutral.
**Core components:** `UrlPill` (host dim, path bold, owner color dot, copy, external-link), `EngineChip`, `PageTypeChip`, `OwnerTag`, `StatCard`, `MatrixCell`, `AnswerWithCitations`, `DiffTable`, `FixItemCard`, `RunProgress`, `PlanLimitModal`, `EmptyState`, `Toast`, `SourceBadge` ("API-grounded · model · date").

## 3. Global layout
Left sidebar (240 px, collapsible on <1024): Dashboard, Prompts, Pages, Fixes (badge = open lost-prompt reports), Competitors, Runs, Settings. Top bar: workspace name, date range, "Run now" (primary), run status pill. Content max-width 1200 px. Mobile: bottom tab bar (Dashboard, Prompts, Fixes, More); tables become cards.

## 4. Screens (build in this order)

### 4.1 Landing `/` (acquisition)
```
[logo]                                        [Pricing] [Log in]
H1: ChatGPT recommended your competitor's pricing page.
    Find out why — page by page.
[ yourdomain.com                    ] [ Get free sample report ▸ ]
 · No signup · ~60 seconds · checks ChatGPT + Perplexity
---------------------------------------------------------------
[Example teardown card: prompt → winning URL → 3 gaps]   (static, real-looking, labeled "Example")
[How it works: Ask → Detect → Diagnose → Fix → Verify]  (5 tiles)
[Pricing strip]   [FAQ incl. "How is this different from site-level trackers?" + limitations]
```
States: input invalid (red border + message), submitting (button spinner), rate-limited ("Come back tomorrow or sign up").

### 4.2 Sample report `/sample/[id]`
- **Progress phase:** vertical step list with check/spinner, elapsed timer, each step's detail line (e.g. "Found 3 pricing, 120 docs, 0 comparison pages"). Skeleton for the result beneath.
- **Result phase:** 
  1. Header: domain, category, `SourceBadge`.
  2. **Matrix** (rows: pricing, docs, comparison; cols: ChatGPT, Perplexity; cell shows `own N | comp N` with color tint; empty cell = "no citation").
  3. **Pages missing from AI answers** — list with reason ("No /comparison page exists", "Your /pricing was never cited; 2 competitors were").
  4. **Top competitor URLs** — `UrlPill` + count + engines.
  5. **Teaser fix** card (3 bullets, 4th row blurred) → CTA **Unlock full fix report (free account)**.
- Partial banner (yellow) when an engine failed.

### 4.3 Auth + Onboarding `/onboarding`
Three-step stepper (Domain → Competitors → Questions), single column 560 px, one primary button per step. Step 3 is a grouped checklist by intent with live counter `12/25 prompts` and a textarea "Paste more (one per line)". Progress persisted.

### 4.4 Dashboard `/app`
```
[Own citation rate] [Lost prompts] [Verified wins] [Next check]     <- 4 StatCards (with delta vs previous run)
------------------------------------------------------------------
Matrix: page type × engine  (MatrixCell: own% bar vs best competitor% bar; click → filtered prompts)
------------------------------------------------------------------
Lost prompts (feed)                         | Recent verified wins / activity
 "best X for Y" · Claude · ChatGPT          |  ✓ /pricing now cited for "…" (ChatGPT)
 winner: competitor.com/pricing  [Open fix] |
```
First run (empty): illustrated `EmptyState` with live `RunProgress`. Partial run: yellow banner "3/4 engines responded".

### 4.5 Prompts `/app/prompts` and detail
List table: prompt, intent, last result per engine (● own cited / ○ not cited / ✕ error), last run time. Row click → detail.
Detail: engine tabs; **AnswerWithCitations** (answer text, superscript markers colored by owner, hover card = URL, title, page type, cited snippet); right rail: ordered URL list, "Retrieved, not cited" accordion, 8-run history strip (green/grey squares), **Open fix report** button.

### 4.6 Fix report `/app/fixes/[id]` (hero screen — spend the most design time here)
```
Prompt: "…"   Engine: ChatGPT · model · date          [Re-check now]
┌ Winner ─────────────────────┐ ┌ Your page ───────────────────┐
│ competitor.com/pricing      │ │ yoursite.com/pricing | NONE  │
└─────────────────────────────┘ └──────────────────────────────┘
Evidence table:   Feature | Winner | You | Δ     (differences first, bold)
   Price visible in HTML      yes      no     ◀ gap
   Pricing table              2        0      ◀ gap
   FAQPage schema             yes      no     ◀ gap
   Words                      1,840    410    ◀ gap
Fix checklist (sorted severity → effort):
 [☐] CRITICAL · S  Put plan prices in server-rendered HTML
      Evidence: "…" · Recommendation: … · [Suggested copy ▸ copy]
 [☐] HIGH · M  Add comparison table of plans …
Disclaimer: Differences vs the cited page — not a guarantee of citation.
```
Items collapse/expand; severity badge colors: critical `#B00020`, high orange, medium yellow, low grey (these are the only other semantic colors allowed). State chips: Open / Done / Verified win / Not yet.

### 4.7 Pages `/app/pages` + detail
Table: URL, owner, type, times cited (30 d), engines, last fetched. Detail: citation timeline by week, snapshots list (diff between snapshots shows what changed on the page since last check — highlights proof the user shipped a change).

### 4.8 Competitors, Runs, Settings
Competitors: cards per domain with head-to-head citation counts by page type. Runs: table (trigger, status, calls, cost, duration) with expandable per-engine errors. Settings: workspace, plan usage meters (prompts, competitors, fix reports, budget), billing portal link, notification toggles.

### 4.9 Pricing `/pricing`
Three columns (Starter / Growth / Audit) per PRD §9, "most popular" on Growth, audit credit explained in one line, FAQ.

## 5. Microcopy rules
Direct, specific, no hype. Examples: "Claude cited **docs.rival.com/api** for this question. Your /docs page wasn't retrieved." · "No sources cited — the engine answered from memory." · "Couldn't fetch competitor page (blocked). Report built from the answer and what we could see." Avoid "AI-powered", "unlock your potential", exclamation marks.

## 6. Interaction details
Copy buttons give toast "Copied". Long URLs: middle-ellipsis with full URL on hover. Keyboard: `j/k` move in lists, `Enter` open, `?` shortcuts (P2). Charts (Recharts): bars not pies; always label axes; tooltips show raw counts and sample size. Motion: ≤150 ms, only for state changes.

## 7. Accessibility & responsive
WCAG AA contrast (verify accent on ink and own/competitor tints); never rely on color alone — pair with icon/label (✓ own, ▲ competitor); focus ring 3px `--info`; all interactive elements ≥40 px tall; tables have captions; SSE progress announced via `aria-live="polite"`. Breakpoints 640 / 1024 / 1280.

## 8. Demo-critical polish checklist
(1) Sample report progress feels alive (staggered steps, real detail lines). (2) Matrix cells show exact URLs on hover. (3) Fix report side-by-side loads < 1 s from cache. (4) Seeded demo workspace shows a "Verified win" card. (5) No lorem ipsum, no broken empty states.
