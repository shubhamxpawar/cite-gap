// Fix-report builder — docs/01-TRD.md §7 + docs/02-App-Flow.md F6.
import { inngest } from './inngest';
import { db } from '@/server/db/client';
import { fixReports, fixItems, pages, pageSnapshots, responses } from '@/server/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { fetchPageSafe } from '@/server/pipeline/fetcher';
import { extractFeatures } from '@/server/pipeline/extract-features';
import { matchOwnPage } from '@/server/pipeline/match-own-page';
import { analyzeGap, type Features } from '@/server/pipeline/analyze-gap';
import { fetchRobotsVerdicts, hasLlmsTxt } from '@/server/pipeline/robots';
import { ownershipOf } from '@/server/pipeline/classify-page';
import crypto from 'node:crypto';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const EFFORT_ORDER = { S: 0, M: 1, L: 2 } as const;

export const buildFixReportJob = inngest.createFunction(
  { id: 'build-fix-report', retries: 1 },
  { event: 'fix-report/build.requested' },
  async ({ event, step }) => {
    const { runId, workspaceId, cap } = event.data as { runId: string; workspaceId: string; cap: number };

    // lost prompts of this run: responses where non-own cited, own not cited
    const lost = await step.run('find-lost', async () => {
      const r = await db.execute(sql`
        select r.id as response_id, r.engine::text as engine, pr.id as prompt_id, pr.text as prompt_text
        from responses r
        join prompts pr on pr.id = r.prompt_id
        where r.run_id = ${runId}::uuid and r.status = 'ok'
          and exists (select 1 from citations c join pages p on p.id = c.page_id
                      where c.response_id = r.id and c.kind = 'cited' and p.owner <> 'own')
          and not exists (select 1 from citations c join pages p on p.id = c.page_id
                      where c.response_id = r.id and c.kind = 'cited' and p.owner = 'own')
        order by case pr.intent when 'pricing' then 0 when 'comparison' then 1 else 2 end
        limit ${cap}
      `);
      return r as unknown as { response_id: string; engine: string; prompt_id: string; prompt_text: string }[];
    });

    for (const lostItem of lost) {
      await step.run(`report:${lostItem.prompt_id}:${lostItem.engine}`, () =>
        buildOneReport({ workspaceId, runId, responseId: lostItem.response_id, engine: lostItem.engine, promptId: lostItem.prompt_id, promptText: lostItem.prompt_text }),
      );
    }
    return { built: lost.length };
  },
);

async function fetchAndExtract(
  workspaceId: string,
  url: string,
  opts: { robots?: Record<string, string>; llmsTxt?: boolean } = {},
): Promise<{ text: string; features: Features } | null> {
  try {
    const res = await fetchPageSafe(url);
    const contentHash = crypto.createHash('sha256').update(res.body).digest('hex');
    const pageRow = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.workspaceId, workspaceId), eq(pages.urlNormalized, url)))
      .limit(1);

    if (pageRow[0]) {
      const recent = await db
        .select({ features: pageSnapshots.features, textExcerpt: pageSnapshots.textExcerpt })
        .from(pageSnapshots)
        .where(and(eq(pageSnapshots.pageId, pageRow[0].id), eq(pageSnapshots.contentHash, contentHash)))
        .limit(1);
      if (recent[0]) return { text: recent[0].textExcerpt ?? '', features: recent[0].features as Features };
    }

    const extracted = extractFeatures(res.body, res.finalUrl, {
      status: res.status,
      headers: res.headers,
      ...(opts.robots ? { robots: opts.robots } : {}),
      ...(opts.llmsTxt !== undefined ? { llmsTxt: opts.llmsTxt } : {}),
    });

    if (pageRow[0]) {
      await db.insert(pageSnapshots).values({
        pageId: pageRow[0].id, workspaceId, finalUrl: res.finalUrl, httpStatus: res.status,
        contentHash, textExcerpt: extracted.text.slice(0, 60_000), features: extracted.features as unknown as object,
      });
      await db.update(pages).set({ lastFetchedAt: new Date(), httpStatus: res.status, contentHash }).where(eq(pages.id, pageRow[0].id));
    }
    return { text: extracted.text, features: extracted.features as unknown as Features };
  } catch {
    return null;
  }
}

async function buildOneReport(args: { workspaceId: string; runId: string; responseId: string; engine: string; promptId: string; promptText: string }) {
  const { workspaceId, runId, responseId, engine, promptId, promptText } = args;

  // winner set: competitor/third-party cited URLs, top 3 by position
  const winnerRows = await db.execute(sql`
    select p.id::text as id, p.url_normalized, p.title, p.page_type::text as page_type, p.owner::text as owner
    from citations c join pages p on p.id = c.page_id
    where c.response_id = ${responseId}::uuid and c.kind = 'cited' and p.owner <> 'own'
    order by c.position limit 3
  `);
  const winners = winnerRows as unknown as { id: string; url_normalized: string; title: string | null; page_type: string; owner: string }[];
  if (winners.length === 0) return; // nothing to compare

  // own candidates: own pages with same page_type as top winner
  const ownCandidates = await db
    .select({ id: pages.id, url: pages.urlNormalized, title: pages.title, pageType: pages.pageType })
    .from(pages)
    .where(and(eq(pages.workspaceId, workspaceId), eq(pages.owner, 'own'), eq(pages.pageType, winners[0].page_type as 'pricing')))
    .limit(50);
  const own = matchOwnPage(promptText, ownCandidates.map((c) => ({ ...c, pageType: c.pageType as string })));

  const ownHost = own ? new URL(own.url).hostname : '';
  const [robots, llmsTxt] = ownHost
    ? await Promise.all([fetchRobotsVerdicts(ownHost), hasLlmsTxt(ownHost)])
    : [undefined, undefined];

  const winnerData = await fetchAndExtract(workspaceId, winners[0].url_normalized);
  const ownData = own ? await fetchAndExtract(workspaceId, own.url, { robots, llmsTxt }) : null;

  const answerRow = await db
    .select({ answerText: responses.answerText })
    .from(responses)
    .where(eq(responses.id, responseId))
    .limit(1);

  const { analysis, model, source } = await analyzeGap({
    prompt: promptText,
    answerExcerpt: answerRow[0]?.answerText ?? '',
    winner: {
      url: winners[0].url_normalized,
      text: winnerData?.text ?? '',
      features: winnerData?.features ?? { wordCount: 0, note: 'page unfetchable' },
    },
    own: ownData && own ? { url: own.url, text: ownData.text, features: ownData.features } : null,
  });

  // persist (idempotent per run+prompt+engine)
  const [report] = await db
    .insert(fixReports)
    .values({
      workspaceId, runId, promptId, engine: engine as 'chatgpt',
      winnerPageIds: winners.map((w) => w.id),
      ownPageId: own?.id ?? null,
      status: 'ready', summary: analysis.summary, llmModel: model,
    })
    .onConflictDoUpdate({
      target: [fixReports.runId, fixReports.promptId, fixReports.engine],
      set: { status: 'ready', summary: analysis.summary, llmModel: model, winnerPageIds: winners.map((w) => w.id), ownPageId: own?.id ?? null },
    })
    .returning({ id: fixReports.id });

  // replace open items; keep done/verified states
  await db.delete(fixItems).where(and(eq(fixItems.reportId, report.id), inArray(fixItems.state, ['open', 'not_yet'])));

  const items = analysis.gaps.map((g) => ({ ...g, source }));
  items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort]);

  if (items.length) {
    await db.insert(fixItems).values(
      items.map((g, i) => ({
        reportId: report.id, workspaceId,
        category: g.category, severity: g.severity, effort: g.effort,
        title: g.title, evidence: g.evidence, recommendation: g.recommendation, suggestedCopy: g.suggestedCopy ?? null,
        source: g.source, sortOrder: i,
      })),
    );
  }
}

export { ownershipOf };
