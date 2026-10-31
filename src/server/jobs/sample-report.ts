// Sample report pipeline — docs/01-TRD.md §10. Public, no workspace.
// Progress is written to sample_reports.progress and streamed by /api/sample/[id]/stream.
import { inngest } from './inngest';
import { db } from '@/server/db/client';
import { sampleReports } from '@/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { discoverPages } from '@/server/pipeline/discover-pages';
import { classifyPage, ownershipOf } from '@/server/pipeline/classify-page';
import { fetchPageSafe } from '@/server/pipeline/fetcher';
import { extractFeatures } from '@/server/pipeline/extract-features';
import { getEnabledEngines } from '@/server/engines';
import { normalizeUrl } from '@/server/pipeline/normalize-url';
import { generatePrompts, inferCategory, brandFromTitle } from '@/server/pipeline/prompts';
import { track } from '@/server/analytics';

export type SampleProgressStep = { step: string; detail: string; at: string; status: 'running' | 'done' | 'error' };
export type SampleResult = {
  category: string;
  pagesByType: Record<string, number>;
  prompts: { text: string; intent: string }[];
  matrix: Record<string, Record<string, { own: number; competitor: number; thirdParty: number }>>;
  missingTypes: string[];
  topCompetitorUrls: { url: string; host: string; count: number; pageType: string }[];
  teaser: { title: string; bullets: string[] };
  engines: string[];
  mock: boolean;
};

export async function appendProgress(id: string, step: string, detail: string, status: SampleProgressStep['status'] = 'done') {
  const entry: SampleProgressStep = { step, detail, at: new Date().toISOString(), status };
  await db
    .update(sampleReports)
    .set({ progress: sql`${sampleReports.progress} || ${JSON.stringify([entry])}::jsonb` })
    .where(eq(sampleReports.id, id));
}

const SAMPLE_ENGINES = ['chatgpt', 'perplexity'] as const;

export const sampleReportJob = inngest.createFunction(
  { id: 'sample-report', retries: 0 },
  { event: 'sample/run.requested' },
  async ({ event, step }) => {
    const { sampleId, hostname } = event.data as { sampleId: string; hostname: string };
    const own = hostname;
    const engines = getEnabledEngines([own], []);
    const usable = engines.filter((e) => (SAMPLE_ENGINES as readonly string[]).includes(e.id));
    const mock = usable.some((e) => e.mock);

    await step.run('progress-reading', () => appendProgress(sampleId, 'Reading your site', `https://${hostname}`));
    const discovered = await step.run('discover-pages', async () => {
      const res = await discoverPages(hostname);
      if (res.error && res.pages.length === 0) {
        // Offline / unreachable site: keep the sample usable with inferred page types.
        // The progress line says so, and mock mode is already labelled in the UI.
        return {
          ...res,
          pages: [
            { url: `https://${hostname}/`, pageType: 'homepage' as const },
            { url: `https://${hostname}/pricing`, pageType: 'pricing' as const },
            { url: `https://${hostname}/docs`, pageType: 'docs' as const },
            { url: `https://${hostname}/compare`, pageType: 'comparison' as const },
          ],
          inferred: true,
        };
      }
      return { ...res, inferred: false };
    });
    await step.run('progress-found', () =>
      appendProgress(
        sampleId,
        'Found your pages',
        discovered.inferred
          ? 'Site unreachable — inferred the usual page types for this demo'
          : `${discovered.pages.length} pages (${['pricing', 'docs', 'comparison', 'alternatives', 'blog']
              .map((t) => `${t}: ${discovered.pages.filter((p) => p.pageType === t).length}`)
              .join(', ')})`,
      ),
    );

    // homepage fetch for category inference (best effort)
    const home = await step.run('homepage', async () => {
      try {
        const r = await fetchPageSafe(`https://${hostname}/`);
        const extracted = extractFeatures(r.body, r.finalUrl, { status: r.status, headers: r.headers });
        return { title: extracted.title, h1: extracted.text.slice(0, 160) };
      } catch {
        return { title: '', h1: '' };
      }
    });
    const category = inferCategory(home.title, home.h1);
    const brand = brandFromTitle(home.title, hostname);
    const prompts = generatePrompts(brand, category);

    await step.run('progress-category', () => appendProgress(sampleId, 'Understanding your category', category));
    await step.run('progress-prompts', () =>
      appendProgress(sampleId, 'Writing buyer questions', `${prompts.length} questions across pricing, docs and comparison`),
    );

    // run each (prompt × engine); keep answers + citations
    type Answer = { promptIdx: number; engine: string; answerText: string; citations: { url: string; title?: string; position: number }[] };
    const answers: Answer[] = [];
    let engineFailures = 0;
    for (const engine of usable) {
      await step.run(`progress-engine-${engine.id}`, () =>
        appendProgress(sampleId, `Asking ${engine.id === 'chatgpt' ? 'ChatGPT' : engine.id === 'perplexity' ? 'Perplexity' : engine.id}…`, 'running 8 buyer questions', 'running'),
      );
      let engineOk = 0;
      for (const [promptIdx, prompt] of prompts.entries()) {
        const res = await step.run(`sample:${engine.id}:${promptIdx}`, async () => {
          try {
            const result = await engine.run(prompt.text, { timeoutMs: 30_000 });
            return {
              answerText: result.answerText,
              citations: result.citations.filter((c) => c.kind === 'cited').map((c) => ({ url: c.url, title: c.title, position: c.position })),
            };
          } catch {
            return null; // single prompt failure must not kill the report
          }
        });
        if (!res) {
          engineFailures += 1;
          continue;
        }
        engineOk += 1;
        answers.push({ promptIdx, engine: engine.id, ...res });
      }
      if (engineOk === 0) engineFailures += 1;
      await step.run(`progress-engine-done-${engine.id}`, () =>
        appendProgress(sampleId, `${engine.id === 'chatgpt' ? 'ChatGPT' : engine.id} answered`, `${engineOk}/${prompts.length} questions with sources`),
      );
    }
    if (answers.length === 0) {
      await step.run('progress-fail', () => appendProgress(sampleId, 'Engines are busy', 'No engine responded. Try again in a minute.', 'error'));
      await db.update(sampleReports).set({ status: 'failed' }).where(eq(sampleReports.id, sampleId));
      return { status: 'failed' as const };
    }

    await step.run('progress-matching', () => appendProgress(sampleId, 'Matching citations', `${answers.length} answers analyzed`));

    // aggregate per docs/04 §7 result shape
    const result = await step.run('aggregate', () => {
      const pagesByType: Record<string, number> = {};
      for (const p of discovered.pages) pagesByType[p.pageType] = (pagesByType[p.pageType] ?? 0) + 1;

      const matrix: SampleResult['matrix'] = {};
      const competitorCounts = new Map<string, { url: string; host: string; count: number; pageType: string }>();
      const ownCitedByType = new Set<string>();

      for (const a of answers) {
        const intent = prompts[a.promptIdx].intent;
        // map intent → page type row: pricing→pricing, howto/docs→docs, comparison/alternatives→comparison
        const rowType = intent === 'pricing' ? 'pricing' : intent === 'howto' || intent === 'docs' ? 'docs' : 'comparison';
        matrix[rowType] ??= {};
        matrix[rowType][a.engine] ??= { own: 0, competitor: 0, thirdParty: 0 };
        for (const c of a.citations) {
          const norm = normalizeUrl(c.url);
          const owner = ownershipOf(norm, own, []);
          const pt = classifyPage(norm, c.title);
          if (owner === 'own') {
            matrix[rowType][a.engine].own += 1;
            ownCitedByType.add(rowType);
          } else if (owner === 'competitor') {
            matrix[rowType][a.engine].competitor += 1;
          } else {
            matrix[rowType][a.engine].thirdParty += 1;
          }
          if (owner !== 'own') {
            const host = new URL(norm).host;
            const prev = competitorCounts.get(norm);
            if (prev) prev.count += 1;
            else competitorCounts.set(norm, { url: norm, host, count: 1, pageType: pt });
          }
        }
      }

      const missingTypes = (['pricing', 'docs', 'comparison'] as const).filter((t) => !ownCitedByType.has(t));
      const topCompetitorUrls = [...competitorCounts.values()].sort((a, b) => b.count - a.count).slice(0, 3);

      // teaser: deterministic (llm teaser is a P1 upgrade)
      const bullets: string[] = [];
      if (missingTypes.includes('comparison')) bullets.push('You have no comparison page for the questions buyers ask — competitors answered instead.');
      if (missingTypes.includes('pricing')) bullets.push(`Your /pricing was never cited; ${topCompetitorUrls[0]?.host ?? 'a competitor'} was.`);
      if (missingTypes.includes('docs')) bullets.push('None of your documentation appeared in any answer.');
      if (bullets.length < 3 && topCompetitorUrls[0]) bullets.push(`${topCompetitorUrls[0].host} was cited ${topCompetitorUrls[0].count}× across your buyer questions.`);
      const teaser = { title: 'Where you lose today', bullets: bullets.slice(0, 3) };

      return {
        category, pagesByType, prompts, matrix, missingTypes, topCompetitorUrls, teaser,
        engines: usable.map((e) => e.id), mock,
      } satisfies SampleResult;
    });

    await step.run('progress-building', () => appendProgress(sampleId, 'Building report', 'done'));
    const status = engineFailures > 0 ? 'partial' : 'ready';
    await db.update(sampleReports).set({ status, result }).where(eq(sampleReports.id, sampleId));
    track('sample_completed', { sampleId, hostname, status, mock, engines: usable.map((e) => e.id) });
    return { status };
  },
);
