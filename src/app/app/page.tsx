import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { checkRuns, fixReports, workspaces } from '@/server/db/schema';
import { getCurrentUser } from '@/server/auth/session';
import { getDashboardSummary, getLatestRuns, getLostPrompts, getVerifiedWins } from '@/server/db/queries';
import { EngineChip, EmptyState, PageTypeChip, SourceBadge, StatCard, UrlPill } from '@/components/ui';

export const dynamic = 'force-dynamic';

const ENGINES = ['chatgpt', 'claude', 'perplexity', 'gemini'];
const ROWS = ['pricing', 'docs', 'comparison', 'alternatives', 'other'];

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ engine?: string; firstRun?: string; running?: string; error?: string }>;
}) {
  const { engine: engineFilter } = await searchParams;
  const user = await getCurrentUser();
  const ws = user!.workspaceId!;

  const { current, previous } = await getLatestRuns(ws);
  const [summary, lost, wins, [wsRow], [latestRun], reports] = await Promise.all([
    getDashboardSummary(ws, current, previous),
    getLostPrompts(ws),
    getVerifiedWins(ws),
    db.select({ nextRunAt: workspaces.nextRunAt }).from(workspaces).where(eq(workspaces.id, ws)).limit(1),
    db.select().from(checkRuns).where(eq(checkRuns.workspaceId, ws)).orderBy(desc(checkRuns.createdAt)).limit(1),
    db.select({ id: fixReports.id, promptId: fixReports.promptId, engine: fixReports.engine })
      .from(fixReports)
      .where(and(eq(fixReports.workspaceId, ws), eq(fixReports.runId, current ?? '00000000-0000-0000-0000-000000000000'))),
  ]);

  const reportByPromptEngine = new Map(reports.map((r) => [`${r.promptId}:${r.engine}`, r.id]));
  const filteredLost = engineFilter ? lost.filter((l) => l.engine === engineFilter) : lost;
  const runRunning = latestRun?.status === 'running' || latestRun?.status === 'queued';
  const noRuns = !current;

  const ownRate = Math.round(summary.ownCitationRate.current * 100);
  const prevRate = Math.round(summary.ownCitationRate.previous * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted">
            {noRuns ? 'Run your first check to see citation data.' : `Latest completed run · ${new Date(latestRun?.finishedAt ?? latestRun?.createdAt ?? Date.now()).toLocaleString()}`}
          </p>
        </div>
        <SourceBadge model={latestRun?.engines?.join('+')} date={latestRun?.finishedAt ? new Date(latestRun.finishedAt).toLocaleDateString() : undefined} />
      </div>

      {latestRun?.status === 'partial' && (
        <p className="border-2 border-ink bg-accent px-3 py-2 text-sm font-medium">
          Partial run: {latestRun.completedCalls} of {latestRun.plannedCalls} calls completed. Missing engine results are excluded from the numbers below.
        </p>
      )}
      {latestRun?.status === 'failed' && (
        <p className="border-2 border-ink bg-competitor-tint px-3 py-2 text-sm font-medium">
          Last run failed ({latestRun.failedCalls} failed calls). Check the Runs page for per-engine errors.
        </p>
      )}

      {noRuns ? (
        <EmptyState
          title={runRunning ? 'Your first check is running' : 'No completed runs yet'}
          body={
            runRunning
              ? 'We are asking your prompts across the configured engines. This page updates when the run finishes; you can navigate away.'
              : 'Add prompts and press “Run now”. The first run takes about a minute with the mock engine.'
          }
          action={<Link href="/app/prompts" className="brutal-flat bg-accent px-4 py-2 font-display font-bold">Review prompts ▸</Link>}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Own citation rate" value={`${ownRate}%`} delta={{ value: `${ownRate - prevRate >= 0 ? '+' : ''}${ownRate - prevRate} pts`, positive: ownRate >= prevRate }} hint={`${summary.matrix.reduce((n, m) => n + m.ownCount, 0)} own citations`} />
            <StatCard label="Lost prompts" value={summary.lostPrompts.current} delta={{ value: `${summary.lostPrompts.current - summary.lostPrompts.previous >= 0 ? '+' : ''}${summary.lostPrompts.current - summary.lostPrompts.previous}`, positive: summary.lostPrompts.current <= summary.lostPrompts.previous }} hint="Competitor or third party cited, you not" />
            <StatCard label="Verified wins" value={summary.verifiedWins} hint="Fix marked done, then your page cited" />
            <StatCard label="Next check" value={wsRow?.nextRunAt ? new Date(wsRow.nextRunAt).toLocaleDateString() : '—'} hint={wsRow?.nextRunAt ? 'Scheduled cadence' : 'No schedule yet'} />
          </div>

          <section className="brutal p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold">Citations by page type</h2>
                <p className="text-xs text-muted">Counts of cited URLs in the latest run. Green = yours, orange = competitor, grey = third party.</p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Link href="/app" className={`border-2 border-ink px-2 py-1 text-xs font-bold ${!engineFilter ? 'bg-accent' : 'bg-surface'}`}>All engines</Link>
                {ENGINES.map((e) => (
                  <Link key={e} href={`/app?engine=${e}`} className={`border-2 border-ink px-2 py-1 text-xs font-bold ${engineFilter === e ? 'bg-accent' : 'bg-surface'}`}>
                    {e}
                  </Link>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <caption className="sr-only">Own versus competitor citations by page type and engine</caption>
                <thead>
                  <tr className="border-b-2 border-ink bg-third-tint">
                    <th scope="col" className="p-2 text-left font-display">Page type</th>
                    {ENGINES.filter((e) => !engineFilter || e === engineFilter).map((e) => (
                      <th key={e} scope="col" className="p-2 text-left"><EngineChip engine={e} /></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => {
                    const cells = summary.matrix.filter((m) => m.pageType === row && (!engineFilter || m.engine === engineFilter));
                    if (cells.length === 0) return null;
                    return (
                      <tr key={row} className="border-b border-ink/20">
                        <th scope="row" className="p-2 text-left"><PageTypeChip type={row} /></th>
                        {ENGINES.filter((e) => !engineFilter || e === engineFilter).map((engine) => {
                          const cell = cells.find((c) => c.engine === engine);
                          if (!cell) return <td key={engine} className="p-2 text-xs text-muted">no citation</td>;
                          const total = cell.ownCount + cell.competitorCount + cell.thirdPartyCount;
                          return (
                            <td key={engine} className="p-2">
                              <div className="flex items-center gap-2">
                                <div className="flex h-3 w-24 overflow-hidden border border-ink bg-surface" title={`own ${cell.ownCount} · competitor ${cell.competitorCount} · third party ${cell.thirdPartyCount}`}>
                                  <span className="bg-own" style={{ width: `${pct(cell.ownCount, total)}%` }} />
                                  <span className="bg-competitor" style={{ width: `${pct(cell.competitorCount, total)}%` }} />
                                  <span className="bg-third" style={{ width: `${pct(cell.thirdPartyCount, total)}%` }} />
                                </div>
                                <span className="font-mono text-xs">own {cell.ownCount} · comp {cell.competitorCount}</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Lost prompts</h2>
                <span className="font-mono text-xs text-muted">{filteredLost.length} open</span>
              </div>
              <ul className="space-y-2">
                {filteredLost.length === 0 && <li className="brutal p-3 text-sm text-muted">No lost prompts in the latest run{engineFilter ? ` for ${engineFilter}` : ''}. Either you were cited everywhere or the engine returned no citations.</li>}
                {filteredLost.slice(0, 12).map((l) => {
                  const reportId = reportByPromptEngine.get(`${l.promptId}:${l.engine}`);
                  return (
                    <li key={`${l.promptId}-${l.engine}`} className="brutal p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-semibold">{l.promptText}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <EngineChip engine={l.engine} />
                            <span className="text-xs text-muted">winner</span>
                            {l.winnerUrl ? <UrlPill url={l.winnerUrl} owner="third_party" /> : <span className="text-xs text-muted">no URL captured</span>}
                          </div>
                        </div>
                        {reportId ? (
                          <Link href={`/app/fixes/${reportId}`} className="brutal-flat shrink-0 bg-accent px-2.5 py-1 text-xs font-bold hover:bg-ink hover:text-surface">Open fix report</Link>
                        ) : (
                          <Link href={`/app/prompts/${l.promptId}`} className="brutal-flat shrink-0 bg-surface px-2.5 py-1 text-xs font-bold">View answer</Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <h2 className="mb-2 font-display text-lg font-bold">Verified wins</h2>
              <ul className="space-y-2">
                {wins.length === 0 && <li className="brutal p-3 text-sm text-muted">Mark a fix item done, run the next check, and a win appears here when your page is cited.</li>}
                {wins.map((w) => (
                  <li key={String(w.report_id)} className="brutal bg-own-tint p-3 text-sm">
                    <p className="font-bold">✓ Your page is now cited</p>
                    <p className="mt-1 font-mono text-xs">{String(w.prompt_text)}</p>
                    <p className="mt-1 text-xs text-muted">{String(w.engine)} · {String(w.own_url ?? 'own page')}</p>
                  </li>
                ))}
              </ul>
              <div className="brutal mt-3 p-3 text-xs text-muted">
                <p className="font-display text-sm font-bold text-ink">Reading this correctly</p>
                <p className="mt-1">Single samples are noisy. A citation is one observation, not a ranking. Compare runs and use the fix report evidence before changing pages.</p>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
