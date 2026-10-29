// Typed query helpers — docs/04-Backend-Schema.md §6.
import { db } from './client';
import { sql as raw } from 'drizzle-orm';
import * as s from './schema';

export type DashboardSummary = {
  ownCitationRate: { current: number; previous: number }; // 0..1
  lostPrompts: { current: number; previous: number };
  verifiedWins: number;
  nextRunAt: string | null;
  matrix: MatrixRow[];
};

export type MatrixRow = {
  pageType: string;
  engine: string;
  ownCount: number;
  competitorCount: number;
  thirdPartyCount: number;
  responsesWithCite: number;
};

export type LostPrompt = {
  promptId: string;
  promptText: string;
  intent: string;
  engine: string;
  responseId: string;
};

export async function getDashboardSummary(ws: string, runId: string | null, prevRunId: string | null): Promise<DashboardSummary> {
  const matrix = await db.execute<MatrixRow>(raw`
    select p.page_type::text as "pageType", r.engine::text as engine,
           count(*) filter (where p.owner = 'own')::int as "ownCount",
           count(*) filter (where p.owner = 'competitor')::int as "competitorCount",
           count(*) filter (where p.owner = 'third_party')::int as "thirdPartyCount",
           count(distinct c.response_id)::int as "responsesWithCite"
    from citations c
    join responses r on r.id = c.response_id
    join pages p on p.id = c.page_id
    where c.kind = 'cited' and r.status = 'ok' and r.workspace_id = ${ws}
      and (${runId}::uuid is null or r.run_id in (${runId}::uuid, ${prevRunId}::uuid))
    group by 1, 2
  `).then((r) => r.rows as unknown as MatrixRow[]);

  const rate = (run: string | null) =>
    run
      ? db.execute<{ own: number; total: number }>(raw`
          select count(distinct r.id) filter (where own_cited.own)::int as own,
                 count(distinct r.id)::int as total
          from responses r
          left join (
            select c.response_id, bool_or(p.owner = 'own') as own
            from citations c join pages p on p.id = c.page_id
            where c.kind = 'cited' group by 1
          ) own_cited on own_cited.response_id = r.id
          where r.status = 'ok' and r.run_id = ${run}::uuid
        `).then((x) => {
          const { own, total } = x.rows[0] ?? { own: 0, total: 0 };
          return total > 0 ? own / total : 0;
        })
      : Promise.resolve(0);

  const losses = (run: string | null) =>
    run
      ? db.execute<{ n: number }>(raw`
          select count(*)::int as n from v_lost_prompts l
          join responses r on r.id = l.id where r.run_id = ${run}::uuid
        `).then((x) => x.rows[0]?.n ?? 0)
      : Promise.resolve(0);

  const [ownCurrent, ownPrevious, lostCurrent, lostPrevious, wins, nextRun] = await Promise.all([
    rate(runId), rate(prevRunId), losses(runId), losses(prevRunId),
    getVerifiedWinsCount(ws),
    db.execute<{ next_run_at: string | null }>(raw`
      select next_run_at::text from workspaces where id = ${ws}::uuid
    `).then((x) => x.rows[0]?.next_run_at ?? null),
  ]);

  return {
    ownCitationRate: { current: ownCurrent, previous: ownPrevious },
    lostPrompts: { current: lostCurrent, previous: lostPrevious },
    verifiedWins: wins,
    nextRunAt: nextRun,
    matrix,
  };
}

export async function getVerifiedWinsCount(ws: string): Promise<number> {
  const r = await db.execute<{ n: number }>(raw`
    select count(distinct report_id)::int as n from fix_items
    where workspace_id = ${ws}::uuid and state = 'verified_win'
  `);
  return r.rows[0]?.n ?? 0;
}

export async function getLostPrompts(ws: string): Promise<(LostPrompt & { winnerHost: string | null; winnerUrl: string | null })[]> {
  const r = await db.execute<LostPrompt & { winnerHost: string | null; winnerUrl: string | null }>(raw`
    select l.prompt_id::text as "promptId", pr.text as "promptText", pr.intent::text as intent,
           l.engine::text as engine, l.id::text as "responseId",
           (select p2.hostname from citations c2 join pages p2 on p2.id = c2.page_id
             where c2.response_id = l.id and c2.kind = 'cited' and p2.owner <> 'own'
             order by c2.position limit 1) as "winnerHost",
           (select p2.url_normalized from citations c2 join pages p2 on p2.id = c2.page_id
             where c2.response_id = l.id and c2.kind = 'cited' and p2.owner <> 'own'
             order by c2.position limit 1) as "winnerUrl"
    from v_lost_prompts l
    join responses r on r.id = l.id
    join prompts pr on pr.id = l.prompt_id
    where l.workspace_id = ${ws}::uuid
    order by case pr.intent when 'pricing' then 0 when 'comparison' then 1 when 'alternatives' then 2 else 3 end
  `);
  return r.rows as unknown as (LostPrompt & { winnerHost: string | null; winnerUrl: string | null })[];
}

export type PromptDetail = {
  prompt: { id: string; text: string; intent: string };
  engines: Record<string, {
    responseId: string; status: string; model: string; answerText: string | null;
    searchQueries: string[]; createdAt: string;
    citations: { url: string; title: string | null; pageType: string; owner: string; kind: string; position: number; citedText: string | null }[];
  }>;
  history: { engine: string; runId: string; ownCited: boolean }[];
};

export async function getPromptDetail(ws: string, promptId: string): Promise<PromptDetail | null> {
  const prompt = await db.execute<{ id: string; text: string; intent: string }>(raw`
    select id::text, text, intent::text from prompts where id = ${promptId}::uuid and workspace_id = ${ws}::uuid
  `);
  if (!prompt.rows.length) return null;

  const latest = await db.execute<{
    id: string; engine: string; status: string; model: string; answer_text: string | null;
    search_queries: string[]; created_at: string;
  }>(raw`
    select distinct on (engine) id::text, engine::text, status::text, model, answer_text,
           search_queries, created_at::text
    from responses where prompt_id = ${promptId}::uuid and workspace_id = ${ws}::uuid
    order by engine, created_at desc
  `);

  const engines: PromptDetail['engines'] = {};
  for (const row of latest.rows) {
    const cits = await db.execute<{
      url: string; title: string | null; page_type: string; owner: string; kind: string; position: number; cited_text: string | null;
    }>(raw`
      select p.url_normalized as url, p.title, p.page_type::text, p.owner::text, c.kind::text, c.position, c.cited_text
      from citations c join pages p on p.id = c.page_id
      where c.response_id = ${row.id}::uuid order by c.position
    `);
    engines[row.engine] = {
      responseId: row.id, status: row.status, model: row.model, answerText: row.answer_text,
      searchQueries: row.search_queries, createdAt: row.created_at,
      citations: cits.rows.map((c) => ({
        url: c.url, title: c.title, pageType: c.page_type, owner: c.owner,
        kind: c.kind, position: c.position, citedText: c.cited_text,
      })),
    };
  }

  const history = await db.execute<{ engine: string; runId: string; ownCited: boolean }>(raw`
    select r.engine::text as engine, r.run_id::text as "runId",
           coalesce(bool_or(p.owner = 'own') filter (where c.kind = 'cited'), false) as "ownCited"
    from responses r
    left join citations c on c.response_id = r.id
    left join pages p on p.id = c.page_id
    where r.prompt_id = ${promptId}::uuid and r.status = 'ok' and r.workspace_id = ${ws}::uuid
    group by r.engine, r.run_id, r.created_at order by r.created_at desc limit 16
  `);

  return { prompt: prompt.rows[0], engines, history: history.rows as unknown as PromptDetail['history'] };
}

export async function getPageHistory(ws: string, pageId: string) {
  const weeks = await db.execute<{ week: string; n: number }>(raw`
    select date_trunc('week', r.created_at)::date::text as week, count(*)::int as n
    from citations c join responses r on r.id = c.response_id
    where c.page_id = ${pageId}::uuid and c.workspace_id = ${ws}::uuid and c.kind = 'cited'
    group by 1 order by 1
  `);
  const page = await db.execute<Record<string, unknown>>(raw`
    select * from pages where id = ${pageId}::uuid and workspace_id = ${ws}::uuid
  `);
  const snapshots = await db.execute<Record<string, unknown>>(raw`
    select id::text, fetched_at::text, http_status, content_hash from page_snapshots
    where page_id = ${pageId}::uuid order by fetched_at desc limit 20
  `);
  return { page: page.rows[0] ?? null, weeks: weeks.rows, snapshots: snapshots.rows };
}

export async function getFixReport(ws: string, reportId: string) {
  const report = await db.execute<Record<string, unknown>>(raw`
    select fr.*, pr.text as prompt_text, pr.intent::text as intent,
           own.url_normalized as own_url, own.hostname as own_host,
           r.created_at as run_created_at
    from fix_reports fr
    join prompts pr on pr.id = fr.prompt_id
    left join pages own on own.id = fr.own_page_id
    join check_runs r on r.id = fr.run_id
    where fr.id = ${reportId}::uuid and fr.workspace_id = ${ws}::uuid
  `);
  if (!report.rows.length) return null;
  const winners = await db.execute<Record<string, unknown>>(raw`
    select p.id::text, p.url_normalized, p.hostname, p.title, p.page_type::text, p.owner::text
    from pages p where p.id = any((select winner_page_ids from fix_reports where id = ${reportId}::uuid)::uuid[])
  `);
  const items = await db.execute<Record<string, unknown>>(raw`
    select * from fix_items where report_id = ${reportId}::uuid order by
      array_position(array['critical','high','medium','low']::text[], severity::text),
      array_position(array['S','M','L']::text[], effort::text), sort_order
  `);
  return { report: report.rows[0], winners: winners.rows, items: items.rows };
}

export async function getVerifiedWins(ws: string) {
  const r = await db.execute<Record<string, unknown>>(raw`
    select fr.id::text as report_id, fr.engine::text, pr.text as prompt_text,
           own.url_normalized as own_url, fr.created_at::text
    from fix_reports fr
    join prompts pr on pr.id = fr.prompt_id
    left join pages own on own.id = fr.own_page_id
    where fr.workspace_id = ${ws}::uuid
      and exists (select 1 from fix_items fi where fi.report_id = fr.id and fi.state = 'verified_win')
    order by fr.created_at desc limit 20
  `);
  return r.rows;
}

// Latest two completed runs for a workspace (dashboard "vs previous" logic).
export async function getLatestRuns(ws: string): Promise<{ current: string | null; previous: string | null }> {
  const r = await db.execute<{ id: string }>(raw`
    select id::text from check_runs
    where workspace_id = ${ws}::uuid and status in ('succeeded','partial')
    order by created_at desc limit 2
  `);
  return { current: r.rows[0]?.id ?? null, previous: r.rows[1]?.id ?? null };
}

export { s };
