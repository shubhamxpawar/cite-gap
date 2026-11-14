// Workspace data lifecycle — destructive operations, each typed and explicit.
// Everything here is scoped to one workspace.
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import {
  checkRuns,
  domains,
  pageSnapshots,
  pages,
  prompts,
  workspaces,
  workspaceBudgets,
} from '@/server/db/schema';

/** Delete one run. Everything derived from it cascades (responses → citations, fix reports → items). Pages are kept. */
export async function deleteRun(workspaceId: string, runId: string): Promise<boolean> {
  const found = await db.select({ id: checkRuns.id }).from(checkRuns).where(and(eq(checkRuns.id, runId), eq(checkRuns.workspaceId, workspaceId))).limit(1);
  if (!found.length) return false;
  await db.delete(checkRuns).where(eq(checkRuns.id, runId));
  return true;
}

export interface ClearRunHistoryResult {
  runs: number;
  responses: number;
  citations: number;
  fixReports: number;
}

/** Delete ALL runs of a workspace and everything derived from them. Keeps prompts, pages, domains, plan and budget caps. */
export async function clearRunHistory(workspaceId: string): Promise<ClearRunHistoryResult> {
  const rows = (await db.execute(sql`
    select
      (select count(*)::int from check_runs where workspace_id = ${workspaceId}::uuid) as runs,
      (select count(*)::int from responses r join check_runs cr on cr.id = r.run_id where cr.workspace_id = ${workspaceId}::uuid) as responses,
      (select count(*)::int from citations c join responses r on r.id = c.response_id join check_runs cr on cr.id = r.run_id where cr.workspace_id = ${workspaceId}::uuid) as citations,
      (select count(*)::int from fix_reports fr join check_runs cr on cr.id = fr.run_id where cr.workspace_id = ${workspaceId}::uuid) as fix_reports
  `)) as unknown as { runs: number; responses: number; citations: number; fix_reports: number }[];
  const c = rows[0] ?? { runs: 0, responses: 0, citations: 0, fix_reports: 0 };
  await db.delete(checkRuns).where(eq(checkRuns.workspaceId, workspaceId));
  // reset spend so a re-run isn't throttled by the provider spend of deleted runs
  await db.delete(workspaceBudgets).where(eq(workspaceBudgets.workspaceId, workspaceId));
  return { runs: c.runs, responses: c.responses, citations: c.citations, fixReports: c.fix_reports };
}

/** Full reset: wipe all workspace data except the workspace itself. Keeps the plan tier and sign-in. */
export async function resetWorkspaceData(workspaceId: string): Promise<{ runs: number; prompts: number; pages: number }> {
  const [runRows, promptRows, pageRows] = await Promise.all([
    db.select({ id: checkRuns.id }).from(checkRuns).where(eq(checkRuns.workspaceId, workspaceId)),
    db.select({ id: prompts.id }).from(prompts).where(eq(prompts.workspaceId, workspaceId)),
    db.select({ id: pages.id }).from(pages).where(eq(pages.workspaceId, workspaceId)),
  ]);

  await db.delete(checkRuns).where(eq(checkRuns.workspaceId, workspaceId)); // cascades responses/citations/fix_reports/fix_items
  await db.delete(pageSnapshots).where(eq(pageSnapshots.workspaceId, workspaceId));
  await db.delete(pages).where(eq(pages.workspaceId, workspaceId));
  await db.delete(prompts).where(eq(prompts.workspaceId, workspaceId));
  await db.delete(domains).where(eq(domains.workspaceId, workspaceId));
  await db.delete(workspaceBudgets).where(eq(workspaceBudgets.workspaceId, workspaceId));
  await db.update(workspaces).set({ brand: null, category: null, nextRunAt: null }).where(eq(workspaces.id, workspaceId));

  return { runs: runRows.length, prompts: promptRows.length, pages: pageRows.length };
}
