// Seed the demo workspace + warm sample reports — docs/06-PRD.md §7 (demo) and
// docs/03-UI-UX-Design.md §8.4 ("seeded demo workspace shows a Verified win card").
// Run: npm run db:seed   (idempotent: replaces the [DEMO] workspace)
import { desc, eq, inArray } from 'drizzle-orm';
import { db, sql as pg } from '../src/server/db/client';
import {
  authUsers, profiles, workspaces, workspaceMembers, domains, prompts, checkRuns, responses,
  pages, citations, pageSnapshots, fixReports, fixItems, workspaceBudgets, sampleReports,
} from '../src/server/db/schema';

const DEMO_EMAIL = 'demo@citegap.dev';
const DEMO_WS = '[DEMO] Acme CRM';
const OWN = 'acme-crm.com';
const RIVAL = 'rival-crm.com';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY);
const hoursAfter = (d: Date, h: number) => new Date(d.getTime() + h * 60 * 60 * 1000);

const PROMPTS: { text: string; intent: 'pricing' | 'docs' | 'comparison' | 'alternatives' | 'howto' | 'brand' }[] = [
  { text: 'how much does acme crm cost for a team of 10?', intent: 'pricing' },
  { text: 'acme crm pricing vs rival crm', intent: 'pricing' },
  { text: 'cheapest crm with email automation for a small team', intent: 'pricing' },
  { text: 'acme crm vs rival crm', intent: 'comparison' },
  { text: 'best crm for a 10 person sales team', intent: 'comparison' },
  { text: 'acme crm alternatives', intent: 'alternatives' },
  { text: 'pipedrive alternatives for startups', intent: 'alternatives' },
  { text: 'how do i import contacts into acme crm', intent: 'docs' },
  { text: 'acme crm api documentation', intent: 'docs' },
  { text: 'how to set up email sequences in acme crm', intent: 'howto' },
  { text: 'how to migrate from hubspot to acme crm', intent: 'howto' },
  { text: 'is acme crm worth it for a small team', intent: 'brand' },
];

const PAGE_ROWS = [
  { url: `https://${OWN}/`, hostname: OWN, pageType: 'homepage' as const, owner: 'own' as const, title: 'Acme CRM — simple pipeline for small teams' },
  { url: `https://${OWN}/pricing`, hostname: OWN, pageType: 'pricing' as const, owner: 'own' as const, title: 'Pricing — Acme CRM' },
  { url: `https://${OWN}/docs/api`, hostname: OWN, pageType: 'docs' as const, owner: 'own' as const, title: 'API documentation — Acme CRM' },
  { url: `https://${OWN}/compare/rival-crm`, hostname: OWN, pageType: 'comparison' as const, owner: 'own' as const, title: 'Acme CRM vs Rival CRM' },
  { url: `https://${RIVAL}/pricing`, hostname: RIVAL, pageType: 'pricing' as const, owner: 'competitor' as const, title: 'Plans and pricing — Rival CRM' },
  { url: `https://${RIVAL}/compare/acme-crm`, hostname: RIVAL, pageType: 'comparison' as const, owner: 'competitor' as const, title: 'Rival CRM vs Acme CRM' },
  { url: 'https://www.pipedrive.com/pricing', hostname: 'www.pipedrive.com', pageType: 'pricing' as const, owner: 'competitor' as const, title: 'Pipedrive pricing' },
  { url: 'https://www.hubspot.com/products/crm', hostname: 'www.hubspot.com', pageType: 'homepage' as const, owner: 'competitor' as const, title: 'HubSpot CRM' },
  { url: 'https://support.pipedrive.com/import-contacts', hostname: 'support.pipedrive.com', pageType: 'docs' as const, owner: 'third_party' as const, title: 'Import contacts — Pipedrive help' },
  { url: 'https://knowledge.hubspot.com/migrate-to-hubspot', hostname: 'knowledge.hubspot.com', pageType: 'docs' as const, owner: 'third_party' as const, title: 'Migrate to HubSpot' },
  { url: 'https://www.g2.com/categories/crm', hostname: 'www.g2.com', pageType: 'other' as const, owner: 'third_party' as const, title: 'Best CRM software — G2' },
  { url: 'https://www.reddit.com/r/sales/crm-small-team', hostname: 'www.reddit.com', pageType: 'blog' as const, owner: 'third_party' as const, title: 'CRM for a small team? — r/sales' },
];

const URL = {
  ownHome: `https://${OWN}/`,
  ownPricing: `https://${OWN}/pricing`,
  ownDocs: `https://${OWN}/docs/api`,
  ownCompare: `https://${OWN}/compare/rival-crm`,
  rivalPricing: `https://${RIVAL}/pricing`,
  rivalCompare: `https://${RIVAL}/compare/acme-crm`,
  pipedrivePricing: 'https://www.pipedrive.com/pricing',
  pipedriveDocs: 'https://support.pipedrive.com/import-contacts',
  hubspotDocs: 'https://knowledge.hubspot.com/migrate-to-hubspot',
  g2: 'https://www.g2.com/categories/crm',
  reddit: 'https://www.reddit.com/r/sales/crm-small-team',
};

const RUN_DATES = [daysAgo(21), daysAgo(14), daysAgo(7), daysAgo(1)];
const ENGINES = ['chatgpt', 'perplexity'] as const;

function ownCited(intent: string, runIdx: number, engine: string): boolean {
  switch (intent) {
    case 'pricing': return runIdx >= 2 && (runIdx === 3 || engine === 'chatgpt');
    case 'comparison': return runIdx >= 3 && engine === 'chatgpt';
    case 'alternatives': return runIdx >= 3 && engine === 'perplexity';
    case 'howto': return runIdx >= 2;
    case 'brand': return runIdx >= 1;
    default: return false; // docs stay lost — that's the open fix report
  }
}

function winnersFor(intent: string, runIdx: number, engine: string): { url: string; title: string }[] {
  const jitter = (runIdx + (engine === 'perplexity' ? 1 : 0)) % 2;
  switch (intent) {
    case 'pricing':
      return jitter
        ? [{ url: URL.rivalPricing, title: 'Plans and pricing — Rival CRM' }, { url: URL.pipedrivePricing, title: 'Pipedrive pricing' }]
        : [{ url: URL.pipedrivePricing, title: 'Pipedrive pricing' }, { url: URL.rivalPricing, title: 'Plans and pricing — Rival CRM' }];
    case 'comparison':
      return [{ url: URL.rivalCompare, title: 'Rival CRM vs Acme CRM' }, { url: URL.g2, title: 'Best CRM software — G2' }];
    case 'alternatives':
      return [{ url: URL.g2, title: 'Best CRM software — G2' }, { url: URL.rivalPricing, title: 'Plans and pricing — Rival CRM' }];
    case 'docs':
      return [{ url: URL.pipedriveDocs, title: 'Import contacts — Pipedrive help' }, { url: URL.hubspotDocs, title: 'Migrate to HubSpot' }];
    case 'howto':
      return [{ url: URL.hubspotDocs, title: 'Migrate to HubSpot' }];
    default:
      return [{ url: URL.reddit, title: 'CRM for a small team? — r/sales' }];
  }
}

function answerFor(text: string, citations: string[]): string {
  return [
    `For “${text}”, the strongest options are covered in the sources below.`,
    'The cited pages agree on the key trade-off: transparent per-seat pricing and an import path that does not need a migration project.',
    citations.length ? `Sources: ${citations.map((_, i) => `[${i + 1}]`).join(' ')}` : 'No sources were cited; the answer comes from model memory.',
  ].join('\n\n');
}

async function main() {
  console.log('Seeding CiteGap demo data…');

  // ---- demo user + workspace (replace previous demo) ----
  const existing = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .innerJoin(authUsers, eq(authUsers.id, workspaceMembers.userId))
    .where(eq(authUsers.email, DEMO_EMAIL));
  if (existing.length) {
    await db.delete(workspaces).where(inArray(workspaces.id, existing.map((e) => e.workspaceId)));
  }

  const [user] = await db
    .insert(authUsers)
    .values({ email: DEMO_EMAIL })
    .onConflictDoUpdate({ target: authUsers.email, set: { email: DEMO_EMAIL } })
    .returning({ id: authUsers.id });
  await db.insert(profiles).values({ userId: user.id, email: DEMO_EMAIL, displayName: 'Demo operator' }).onConflictDoNothing();

  const [ws] = await db
    .insert(workspaces)
    .values({ name: DEMO_WS, plan: 'growth', nextRunAt: daysAgo(-3), runCadenceHours: 168 })
    .returning({ id: workspaces.id });
  await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: user.id, role: 'owner' });

  await db.insert(domains).values([
    { workspaceId: ws.id, hostname: OWN, role: 'own', label: 'Acme CRM' },
    { workspaceId: ws.id, hostname: RIVAL, role: 'competitor', label: 'Rival CRM' },
    { workspaceId: ws.id, hostname: 'www.pipedrive.com', role: 'competitor', label: 'Pipedrive' },
    { workspaceId: ws.id, hostname: 'www.hubspot.com', role: 'competitor', label: 'HubSpot' },
  ]);

  const promptRows = await db
    .insert(prompts)
    .values(PROMPTS.map((p, i) => ({ workspaceId: ws.id, text: p.text, intent: p.intent, source: i % 3 === 0 ? 'generated' : 'manual' })))
    .returning({ id: prompts.id, text: prompts.text, intent: prompts.intent });

  const pageRows = await db
    .insert(pages)
    .values(PAGE_ROWS.map((p) => ({
      workspaceId: ws.id, urlNormalized: p.url, hostname: p.hostname, pageType: p.pageType,
      owner: p.owner, title: p.title, discoveredVia: 'citation', lastFetchedAt: daysAgo(1), httpStatus: 200,
      contentHash: `seed-${p.pageType}-${p.hostname}`,
    })))
    .returning({ id: pages.id, url: pages.urlNormalized });
  const pageId = new Map(pageRows.map((p) => [p.url, p.id]));

  // ---- four weekly runs with responses + citations ----
  for (const [runIdx, createdAt] of RUN_DATES.entries()) {
    const partial = runIdx === 1;
    const planned = promptRows.length * ENGINES.length;
    const [run] = await db
      .insert(checkRuns)
      .values({
        workspaceId: ws.id, trigger: runIdx === 0 ? 'onboarding' : 'schedule',
        status: partial ? 'partial' : 'succeeded', engines: [...ENGINES],
        samplesPerPrompt: 1, plannedCalls: planned,
        completedCalls: partial ? planned - 2 : planned, failedCalls: partial ? 2 : 0,
        costUsd: partial ? '0.41' : '0.48',
        startedAt: createdAt, finishedAt: hoursAfter(createdAt, 1), createdAt,
      })
      .returning({ id: checkRuns.id });

    const responseValues = promptRows.flatMap((p) => ENGINES.map((engine) => {
      const isPartialFail = partial && engine === 'perplexity' && p.intent === 'docs';
      return {
        workspaceId: ws.id, runId: run.id, promptId: p.id, engine, sampleIdx: 0,
        model: engine === 'chatgpt' ? 'gpt-4.1-mini' : 'sonar',
        status: isPartialFail ? 'error' as const : 'ok' as const,
        errorCode: isPartialFail ? 'PROVIDER_TIMEOUT' : null,
        answerText: isPartialFail ? null : answerFor(p.text, []),
        searchQueries: isPartialFail ? [] : [`${p.text} pricing`, `${p.intent} crm comparison`],
        latencyMs: 900 + ((runIdx * 37 + p.text.length * 11) % 800),
        costUsd: '0.02', createdAt: hoursAfter(createdAt, 0.2 + Math.random() * 0.1),
      };
    }));
    const respRows = await db.insert(responses).values(responseValues).returning({ id: responses.id, promptId: responses.promptId, engine: responses.engine, status: responses.status });

    const citationValues: (typeof citations.$inferInsert)[] = [];
    for (const resp of respRows) {
      if (resp.status !== 'ok') continue;
      const prompt = promptRows.find((p) => p.id === resp.promptId)!;
      const cited: { url: string; title: string; position: number }[] = [];
      if (ownCited(prompt.intent, runIdx, resp.engine)) {
        const ownUrl = prompt.intent === 'pricing' ? URL.ownPricing
          : prompt.intent === 'comparison' ? URL.ownCompare
          : prompt.intent === 'alternatives' ? URL.ownPricing
          : prompt.intent === 'brand' ? URL.ownHome
          : URL.ownDocs;
        const ownPage = PAGE_ROWS.find((p) => p.url === ownUrl)!;
        cited.push({ url: ownUrl, title: ownPage.title, position: 1 });
      }
      for (const w of winnersFor(prompt.intent, runIdx, resp.engine)) {
        if (cited.some((c) => c.url === w.url)) continue;
        cited.push({ ...w, position: cited.length + 1 });
      }
      for (const c of cited) {
        const page = pageId.get(c.url);
        if (!page) continue;
        citationValues.push({
          workspaceId: ws.id, responseId: resp.id, pageId: page, urlRaw: c.url,
          kind: 'cited', position: c.position,
          citedText: c.url.includes(RIVAL) ? 'Plans start at $29 per seat per month, billed annually.' : null,
        });
      }
      // retrieved-but-not-cited: our docs page is often read but never chosen for docs prompts
      if (prompt.intent === 'docs' && !ownCited(prompt.intent, runIdx, resp.engine)) {
        citationValues.push({
          workspaceId: ws.id, responseId: resp.id, pageId: pageId.get(URL.ownDocs)!, urlRaw: URL.ownDocs,
          kind: 'retrieved', position: cited.length + 1, citedText: 'Acme CRM API — authentication and contacts endpoints.',
        });
      }
    }
    if (citationValues.length) await db.insert(citations).values(citationValues);
  }

  // ---- snapshots (prove a shipped change on /pricing) ----
  const snapshots = [
    { url: URL.ownPricing, at: daysAgo(8), features: { httpStatus: 200, noindex: false, likelyJsRendered: true, wordCount: 410, h1Count: 1, questionHeadings: 0, tables: 0, priceTokens: 0, planNames: 0, codeBlocks: 0, jsonLdTypes: [], visibleDate: false, dateModified: null, metaDescriptionLen: 88, titleLen: 31, outboundLinks: 4, robots: 'allowed' } },
    { url: URL.ownPricing, at: daysAgo(1), features: { httpStatus: 200, noindex: false, likelyJsRendered: false, wordCount: 780, h1Count: 1, questionHeadings: 4, tables: 1, priceTokens: 12, planNames: 3, codeBlocks: 0, jsonLdTypes: ['FAQPage', 'Product'], visibleDate: true, dateModified: '2026-10-24', metaDescriptionLen: 142, titleLen: 41, outboundLinks: 6, robots: 'allowed' } },
    { url: URL.rivalPricing, at: daysAgo(1), features: { httpStatus: 200, noindex: false, likelyJsRendered: false, wordCount: 1840, h1Count: 1, questionHeadings: 7, tables: 2, priceTokens: 14, planNames: 4, codeBlocks: 0, jsonLdTypes: ['FAQPage', 'Product', 'Offer'], visibleDate: true, dateModified: '2026-10-20', metaDescriptionLen: 151, titleLen: 38, outboundLinks: 11, robots: 'allowed' } },
    { url: URL.ownDocs, at: daysAgo(1), features: { httpStatus: 200, noindex: false, likelyJsRendered: false, wordCount: 320, h1Count: 1, questionHeadings: 1, tables: 0, priceTokens: 0, planNames: 0, codeBlocks: 2, jsonLdTypes: [], visibleDate: false, dateModified: null, metaDescriptionLen: 64, titleLen: 27, outboundLinks: 2, robots: 'allowed' } },
  ];
  await db.insert(pageSnapshots).values(snapshots.map((s) => ({
    pageId: pageId.get(s.url)!, workspaceId: ws.id, fetchedAt: s.at, finalUrl: s.url,
    httpStatus: 200, contentHash: `snap-${s.url}-${s.at.getTime()}`, textExcerpt: s.url, features: s.features,
  })));

  // ---- fix reports: one verified win, two open ----
  const [oldestRun] = await db
    .select({ id: checkRuns.id, createdAt: checkRuns.createdAt })
    .from(checkRuns).where(eq(checkRuns.workspaceId, ws.id)).orderBy(checkRuns.createdAt).limit(1);
  const [latestRun] = await db
    .select({ id: checkRuns.id, createdAt: checkRuns.createdAt })
    .from(checkRuns).where(eq(checkRuns.workspaceId, ws.id)).orderBy(desc(checkRuns.createdAt)).limit(1);

  const docsPrompt = promptRows.find((p) => p.text.startsWith('how do i import contacts'))!;
  const comparePrompt = promptRows.find((p) => p.text === 'acme crm vs rival crm')!;
  const pricingPrompt = promptRows.find((p) => p.text.startsWith('how much does acme'))!;

  const reportRows = await db
    .insert(fixReports)
    .values([
      {
        workspaceId: ws.id, runId: oldestRun.id, promptId: pricingPrompt.id, engine: 'chatgpt',
        winnerPageIds: [pageId.get(URL.rivalPricing)!, pageId.get(URL.pipedrivePricing)!],
        ownPageId: pageId.get(URL.ownPricing)!, status: 'ready', llmModel: 'deterministic',
        summary: 'Your pricing table is rendered client-side; the cited pages ship prices in HTML and a FAQ block.',
        createdAt: oldestRun.createdAt,
      },
      {
        workspaceId: ws.id, runId: latestRun.id, promptId: docsPrompt.id, engine: 'chatgpt',
        winnerPageIds: [pageId.get(URL.pipedriveDocs)!, pageId.get(URL.hubspotDocs)!],
        ownPageId: pageId.get(URL.ownDocs)!, status: 'ready', llmModel: 'deterministic',
        summary: 'The cited help pages answer the import question in the first 120 words and show the exact field mapping.',
        createdAt: latestRun.createdAt,
      },
      {
        workspaceId: ws.id, runId: latestRun.id, promptId: comparePrompt.id, engine: 'perplexity',
        winnerPageIds: [pageId.get(URL.rivalCompare)!, pageId.get(URL.g2)!],
        ownPageId: pageId.get(URL.ownCompare)!, status: 'ready', llmModel: 'deterministic',
        summary: 'The winning comparison page has a feature table with prices, while yours is prose only.',
        createdAt: latestRun.createdAt,
      },
    ])
    .returning({ id: fixReports.id, promptId: fixReports.promptId });

  const verifiedReport = reportRows.find((r) => r.promptId === pricingPrompt.id)!;
  const docsReport = reportRows.find((r) => r.promptId === docsPrompt.id)!;
  const compareReport = reportRows.find((r) => r.promptId === comparePrompt.id)!;

  await db.insert(fixItems).values([
    {
      reportId: verifiedReport.id, workspaceId: ws.id, category: 'technical', severity: 'critical', effort: 'S',
      title: 'Put plan prices in server-rendered HTML', source: 'deterministic', state: 'verified_win', sortOrder: 0,
      evidence: 'Winner has 12 price tokens in HTML; your page has 0 (table renders client-side).',
      recommendation: 'Render the plan grid and per-seat prices on the server, then hydrate interactivity.',
      suggestedCopy: '<table><tr><th>Plan</th><th>Price</th></tr><tr><td>Starter</td><td>$19 / seat / mo</td></tr></table>',
      markedDoneAt: daysAgo(6), verifiedAt: daysAgo(1),
    },
    {
      reportId: verifiedReport.id, workspaceId: ws.id, category: 'content', severity: 'high', effort: 'M',
      title: 'Add an FAQ block with the buyer questions', source: 'deterministic', state: 'done', sortOrder: 1,
      evidence: 'Winner has 7 question headings and FAQPage schema; yours has 0.',
      recommendation: 'Add 5–7 H2 questions with short answers, and FAQPage JSON-LD.',
      markedDoneAt: daysAgo(6),
    },
    {
      reportId: docsReport.id, workspaceId: ws.id, category: 'content', severity: 'high', effort: 'S',
      title: 'Answer the import question above the fold', source: 'deterministic', state: 'open', sortOrder: 0,
      evidence: 'Cited help page answers "how do I import contacts" in the first 120 words; your /docs/api opens with auth.',
      recommendation: 'Add a short import section with the CSV field mapping and a copy-paste example.',
      suggestedCopy: '## Import contacts from a CSV\n1. Open Settings → Import.\n2. Map email, first name, company.\n3. Preview and confirm.',
    },
    {
      reportId: docsReport.id, workspaceId: ws.id, category: 'structure', severity: 'medium', effort: 'M',
      title: 'Add a question-shaped heading for import', source: 'deterministic', state: 'open', sortOrder: 1,
      evidence: 'The winner uses an H2 phrased as the buyer question; your page has no question headings.',
      recommendation: 'Use the exact buyer phrasing as an H2, then a 40-word answer.',
    },
    {
      reportId: docsReport.id, workspaceId: ws.id, category: 'coverage', severity: 'low', effort: 'L',
      title: 'Publish a migration guide from HubSpot', source: 'llm', state: 'open', sortOrder: 2,
      evidence: 'A third-party migration guide is cited for the how-to prompt.',
      recommendation: 'Write a step-by-step migration guide and link it from /docs.',
    },
    {
      reportId: compareReport.id, workspaceId: ws.id, category: 'structure', severity: 'critical', effort: 'M',
      title: 'Replace comparison prose with a feature table', source: 'deterministic', state: 'open', sortOrder: 0,
      evidence: 'Winner has 2 comparison tables and visible prices; your comparison page has 0 tables.',
      recommendation: 'Add a table: feature rows, Acme / Rival columns, price row included.',
      suggestedCopy: '| Feature | Acme CRM | Rival CRM |\n|---|---|---|\n| Price / seat | $19 | $29 |\n| Email automation | ✓ | ✓ |',
    },
    {
      reportId: compareReport.id, workspaceId: ws.id, category: 'freshness', severity: 'medium', effort: 'S',
      title: 'Show a visible last-updated date', source: 'deterministic', state: 'open', sortOrder: 1,
      evidence: 'Winner shows dateModified 2026-10-20; your comparison page has no visible date.',
      recommendation: 'Add "Last updated" with a date and keep it current.',
    },
  ]);

  // ---- plan budget for the current month ----
  const month = new Date().toISOString().slice(0, 7) + '-01';
  await db.insert(workspaceBudgets).values({ workspaceId: ws.id, month, capUsd: '30', spentUsd: '3.42' })
    .onConflictDoUpdate({ target: [workspaceBudgets.workspaceId, workspaceBudgets.month], set: { spentUsd: '3.42', capUsd: '30' } });

  // ---- warm sample reports (mock: true) ----
  const sampleHosts = ['linear.app', 'notion.so', 'height.app'];
  await db.delete(sampleReports).where(inArray(sampleReports.hostname, sampleHosts));
  const baseResult = {
    category: 'project management software',
    pagesByType: { pricing: 1, docs: 3, comparison: 1, blog: 2 },
    matrix: {
      pricing: { chatgpt: { own: 0, competitor: 2, thirdParty: 1 }, perplexity: { own: 0, competitor: 1, thirdParty: 2 } },
      docs: { chatgpt: { own: 1, competitor: 1, thirdParty: 0 }, perplexity: { own: 0, competitor: 2, thirdParty: 1 } },
      comparison: { chatgpt: { own: 0, competitor: 2, thirdParty: 0 }, perplexity: { own: 0, competitor: 1, thirdParty: 1 } },
    },
    missingTypes: ['pricing', 'comparison'],
    teaser: {
      title: 'Where you lose today',
      bullets: [
        'You have no comparison page for the questions buyers ask — competitors answered instead.',
        'Your /pricing was never cited; asana.com was.',
        'None of your documentation appeared for the two docs questions.',
      ],
    },
    engines: ['chatgpt', 'perplexity'],
    mock: true,
  };
  await db.insert(sampleReports).values(sampleHosts.map((host, i) => ({
    hostname: host,
    status: 'ready',
    createdAt: daysAgo(i + 1),
    expiresAt: daysAgo(i + 1 - 7),
    costUsd: '0.12',
    progress: [
      { step: 'Reading your site', detail: `https://${host}`, at: daysAgo(i + 1).toISOString(), status: 'done' },
      { step: 'Found your pages', detail: '7 pages (pricing: 1, docs: 3, comparison: 1, blog: 2)', at: daysAgo(i + 1).toISOString(), status: 'done' },
      { step: 'Writing buyer questions', detail: '8 questions across pricing, docs and comparison', at: daysAgo(i + 1).toISOString(), status: 'done' },
      { step: 'ChatGPT answered', detail: '8/8 questions with sources', at: daysAgo(i + 1).toISOString(), status: 'done' },
      { step: 'Building report', detail: 'done', at: daysAgo(i + 1).toISOString(), status: 'done' },
    ],
    result: {
      ...baseResult,
      prompts: PROMPTS.slice(0, 8).map((p) => ({ text: p.text.replace('acme crm', host.split('.')[0]), intent: p.intent })),
      topCompetitorUrls: [
        { url: `https://asana.com/pricing`, host: 'asana.com', count: 3, pageType: 'pricing' },
        { url: `https://www.g2.com/categories/project-management`, host: 'www.g2.com', count: 2, pageType: 'other' },
        { url: `https://monday.com/compare/asana`, host: 'monday.com', count: 2, pageType: 'comparison' },
      ],
    },
  })));

  console.log(`✓ ${DEMO_WS}: 4 runs, ${promptRows.length} prompts, ${pageRows.length} pages, 3 fix reports (1 verified win)`);
  console.log(`✓ ${sampleHosts.length} warm sample reports`);
  console.log(`   Sign in at /login with ${DEMO_EMAIL}`);
}

main()
  .then(() => pg.end())
  .catch(async (err) => {
    console.error(err);
    await pg.end();
    process.exit(1);
  });
