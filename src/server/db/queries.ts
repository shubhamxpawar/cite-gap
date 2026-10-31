// Typed query helpers — docs/04-Backend-Schema.md §6.
// postgres-js (drizzle) returns row arrays directly; `q<T>()` gives them a type.
import { db } from './client';
import { sql as raw, type SQL } from 'drizzle-orm';
import * as s from './schema';

async function q<T>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return result as unknown as T[];
}

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
  winnerHost: string | null;
  winnerUrl: string | null;
};

export async function getDashboardSummary(ws: string, runId: string | null, prevRunId: string | null): Promise<DashboardSummary> {
  const matrix = await q<MatrixRow>(raw`
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
  `);

  const rate = (run: string | null) =>
    run
      ? q<{ own: number; total: number }>(raw`
          select count(distinct r.id) filter (where own_cited.own)::int as own,
                 count(distinct r.id)::int as total
          from responses r
          left join (
            select c.response_id, bool_or(p.owner = 'own') as own
            from citations c join pages p on p.id = c.page_id
            where c.kind = 'cited' group by 1
          ) own_cited on own_cited.response_id = r.id
          where r.status = 'ok' and r.run_id = ${run}::uuid
        `).then((rows) => {
          const { own, total } = rows[0] ?? { own: 0, total: 0 };
          return total > 0 ? own / total : 0;
        })
      : Promise.resolve(0);

  const losses = (run: string | null) =>
    run
      ? q<{ n: number }>(raw`
          select count(*)::int as n from v_lost_prompts l
          join responses r on r.id = l.id where r.run_id = ${run}::uuid
        `).then((rows) => rows[0]?.n ?? 0)
      : Promise.resolve(0);

  const [ownCurrent, ownPrevious, lostCurrent, lostPrevious, wins, nextRunRows] = await Promise.all([
    rate(runId), rate(prevRunId), losses(runId), losses(prevRunId),
    getVerifiedWinsCount(ws),
    q<{ next_run_at: string | null }>(raw`select next_run_at::text from workspaces where id = ${ws}::uuid`),
  ]);

  return {
    ownCitationRate: { current: ownCurrent, previous: ownPrevious },
    lostPrompts: { current: lostCurrent, previous: lostPrevious },
    verifiedWins: wins,
    nextRunAt: nextRunRows[0]?.next_run_at ?? null,
    matrix,
  };
}

export async function getVerifiedWinsCount(ws: string): Promise<number> {
  const rows = await q<{ n: number }>(raw`
    select count(distinct report_id)::int as n from fix_items
    where workspace_id = ${ws}::uuid and state = 'verified_win'
  `);
  return rows[0]?.n ?? 0;
}

export async function getLostPrompts(ws: string): Promise<LostPrompt[]> {
  return q<LostPrompt>(raw`
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
  const promptRows = await q<{ id: string; text: string; intent: string }>(raw`
    select id::text, text, intent::text from prompts where id = ${promptId}::uuid and workspace_id = ${ws}::uuid
  `);
  if (!promptRows.length) return null;

  const latest = await q<{
    id: string; engine: string; status: string; model: string; answer_text: string | null;
    search_queries: string[]; created_at: string;
  }>(raw`
    select distinct on (engine) id::text, engine::text, status::text, model, answer_text,
           search_queries, created_at::text
    from responses where prompt_id = ${promptId}::uuid and workspace_id = ${ws}::uuid
    order by engine, created_at desc
  `);

  const engines: PromptDetail['engines'] = {};
  for (const row of latest) {
    const cits = await q<{
      url: string; title: string | null; page_type: string; owner: string; kind: string; position: number; cited_text: string | null;
    }>(raw`
      select p.url_normalized as url, p.title, p.page_type::text, p.owner::text, c.kind::text, c.position, c.cited_text
      from citations c join pages p on p.id = c.page_id
      where c.response_id = ${row.id}::uuid order by c.position
    `);
    engines[row.engine] = {
      responseId: row.id, status: row.status, model: row.model, answerText: row.answer_text,
      searchQueries: row.search_queries, createdAt: row.created_at,
      citations: cits.map((c) => ({
        url: c.url, title: c.title, pageType: c.page_type, owner: c.owner,
        kind: c.kind, position: c.position, citedText: c.cited_text,
      })),
    };
  }

  const history = await q<{ engine: string; runId: string; ownCited: boolean }>(raw`
    select r.engine::text as engine, r.run_id::text as "runId",
           coalesce(bool_or(p.owner = 'own') filter (where c.kind = 'cited'), false) as "ownCited"
    from responses r
    left join citations c on c.response_id = r.id
    left join pages p on p.id = c.page_id
    where r.prompt_id = ${promptId}::uuid and r.status = 'ok' and r.workspace_id = ${ws}::uuid
    group by r.engine, r.run_id, r.created_at order by r.created_at desc limit 16
  `);

  return { prompt: promptRows[0], engines, history };
}

export async function getPageHistory(ws: string, pageId: string) {
  const weeks = await q<{ week: string; n: number }>(raw`
    select date_trunc('week', r.created_at)::date::text as week, count(*)::int as n
    from citations c join responses r on r.id = c.response_id
    where c.page_id = ${pageId}::uuid and c.workspace_id = ${ws}::uuid and c.kind = 'cited'
    group by 1 order by 1
  `);
  const page = await q<Record<string, unknown>>(raw`
    select id::text, url_normalized, hostname, page_type::text, owner::text, title, last_fetched_at::text, http_status
    from pages where id = ${pageId}::uuid and workspace_id = ${ws}::uuid
  `);
  const snapshots = await q<Record<string, unknown>>(raw`
    select id::text, fetched_at::text, http_status, content_hash, features from page_snapshots
    where page_id = ${pageId}::uuid order by fetched_at desc limit 20
  `);
  return { page: page[0] ?? null, weeks, snapshots };
}

export async function getFixReport(ws: string, reportId: string) {
  const reportRows = await q<Record<string, unknown>>(raw`
    select fr.id::text, fr.engine::text, fr.status::text, fr.summary, fr.llm_model,
           fr.own_page_id::text, fr.winner_page_ids, fr.created_at::text,
           pr.text as prompt_text, pr.intent::text as intent,
           own.url_normalized as own_url, own.hostname as own_host,
           r.created_at::text as run_created_at
    from fix_reports fr
    join prompts pr on pr.id = fr.prompt_id
    left join pages own on own.id = fr.own_page_id
    join check_runs r on r.id = fr.run_id
    where fr.id = ${reportId}::uuid and fr.workspace_id = ${ws}::uuid
  `);
  if (!reportRows.length) return null;
  const winners = await q<Record<string, unknown>>(raw`
    select p.id::text, p.url_normalized, p.hostname, p.title, p.page_type::text, p.owner::text
    from pages p where p.id = any((select winner_page_ids from fix_reports where id = ${reportId}::uuid)::uuid[])
  `);
  const items = await q<Record<string, unknown>>(raw`
    select id::text, category::text, severity::text, effort::text, title, evidence, recommendation,
           suggested_copy, source, state::text, marked_done_at::text, verified_at::text
    from fix_items where report_id = ${reportId}::uuid order by
      array_position(array['critical','high','medium','low']::text[], severity::text),
      array_position(array['S','M','L']::text[], effort::text), sort_order
  `);
  return { report: reportRows[0], winners, items };
}

export async function getVerifiedWins(ws: string) {
  return q<Record<string, unknown>>(raw`
    select fr.id::text as report_id, fr.engine::text, pr.text as prompt_text,
           own.url_normalized as own_url, fr.created_at::text
    from fix_reports fr
    join prompts pr on pr.id = fr.prompt_id
    left join pages own on own.id = fr.own_page_id
    where fr.workspace_id = ${ws}::uuid
      and exists (select 1 from fix_items fi where fi.report_id = fr.id and fi.state = 'verified_win')
    order by fr.created_at desc limit 20
  `);
}

// Latest two completed runs for a workspace (dashboard "vs previous" logic).
export async function getLatestRuns(ws: string): Promise<{ current: string | null; previous: string | null }> {
  const rows = await q<{ id: string }>(raw`
    select id::text from check_runs
    where workspace_id = ${ws}::uuid and status in ('succeeded','partial')
    order by created_at desc limit 2
  `);
  return { current: rows[0]?.id ?? null, previous: rows[1]?.id ?? null };
}

// Fix reports feed for /app/fixes.
export async function getFixReports(ws: string, state?: string) {
  return q<Record<string, unknown>>(raw`
    select fr.id::text, fr.engine::text, fr.status::text, fr.summary, fr.created_at::text,
           pr.text as prompt_text, pr.intent::text as intent,
           own.url_normalized as own_url, own.hostname as own_host,
           (select count(*)::int from fix_items fi where fi.report_id = fr.id) as item_count,
           (select count(*)::int from fix_items fi where fi.report_id = fr.id and fi.state = 'done') as done_count,
           (select count(*)::int from fix_items fi where fi.report_id = fr.id and fi.state = 'verified_win') as win_count
    from fix_reports fr
    join prompts pr on pr.id = fr.prompt_id
    left join pages own on own.id = fr.own_page_id
    where fr.workspace_id = ${ws}::uuid
      and (${state ?? null}::text is null or exists (
        select 1 from fix_items fi where fi.report_id = fr.id and fi.state::text = ${state ?? null}
      ))
    order by fr.created_at desc
  `);
}

export async function getPages(ws: string, owner?: string, type?: string) {
  return q<Record<string, unknown>>(raw`
    select p.id::text, p.url_normalized, p.hostname, p.page_type::text, p.owner::text, p.title,
           p.last_fetched_at::text, p.http_status,
           (select count(*)::int from citations c
             join responses r on r.id = c.response_id
             where c.page_id = p.id and c.kind = 'cited' and r.created_at > now() - interval '30 days') as cited_30d,
           (select coalesce(array_agg(distinct r.engine::text), '{}')
             from citations c join responses r on r.id = c.response_id
             where c.page_id = p.id and c.kind = 'cited') as engines
    from pages p
    where p.workspace_id = ${ws}::uuid
      and (${owner ?? null}::text is null or p.owner::text = ${owner ?? null})
      and (${type ?? null}::text is null or p.page_type::text = ${type ?? null})
    order by cited_30d desc, p.created_at desc
    limit 500
  `);
}

export async function getRuns(ws: string) {
  return q<Record<string, unknown>>(raw`
    select id::text, trigger, status::text, planned_calls, completed_calls, failed_calls,
           cost_usd::text, started_at::text, finished_at::text, created_at::text, engines::text[]
    from check_runs where workspace_id = ${ws}::uuid order by created_at desc limit 50
  `);
}

// Per-engine failures for a run (expandable row in /app/runs).
export async function getRunErrors(ws: string) {
  return q<{ runId: string; engine: string; errorCode: string | null; n: number }>(raw`
    select run_id::text as "runId", engine::text, error_code as "errorCode", count(*)::int as n
    from responses
    where workspace_id = ${ws}::uuid and status = 'error'
    group by 1, 2, 3
  `);
}

// Plan usage meters for /app/settings.
export async function getUsage(ws: string) {
  const rows = await q<Record<string, unknown>>(raw`
    select
      (select count(*)::int from prompts where workspace_id = ${ws}::uuid and active) as prompts,
      (select count(*)::int from domains where workspace_id = ${ws}::uuid and role = 'competitor') as competitors,
      (select count(*)::int from fix_reports where workspace_id = ${ws}::uuid and created_at >= date_trunc('month', now())) as fix_reports,
      (select coalesce(sum(cost_usd), 0)::text from check_runs where workspace_id = ${ws}::uuid and created_at >= date_trunc('month', now())) as run_spend,
      (select coalesce(spent_usd, 0)::text from workspace_budgets where workspace_id = ${ws}::uuid and month = date_trunc('month', now())::date) as budget_spent,
      (select cap_usd::text from workspace_budgets where workspace_id = ${ws}::uuid and month = date_trunc('month', now())::date) as budget_cap
  `);
  return rows[0] ?? {};
}

export async function getCompetitors(ws: string) {
  const domains = await q<Record<string, unknown>>(raw`
    select id::text, hostname, role::text, label from domains where workspace_id = ${ws}::uuid order by role, hostname
  `);
  const counts = await q<{ hostname: string; page_type: string; owner: string; n: number }>(raw`
    select p.hostname, p.page_type::text, p.owner::text, count(*)::int as n
    from citations c join pages p on p.id = c.page_id
    join responses r on r.id = c.response_id
    where c.workspace_id = ${ws}::uuid and c.kind = 'cited' and r.status = 'ok'
    group by 1,2,3
  `);
  return { domains, counts };
}

export { s };
