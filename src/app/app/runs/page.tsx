import { getCurrentUser } from '@/server/auth/session';
import { getRunErrors, getRuns } from '@/server/db/queries';
import { cancelRunAction } from '@/app/actions';
import { EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  succeeded: 'bg-own-tint text-own',
  partial: 'bg-accent',
  failed: 'bg-competitor text-surface',
  running: 'bg-accent',
  queued: 'bg-third-tint',
  canceled: 'bg-third-tint text-muted',
};

function duration(start: unknown, end: unknown): string {
  if (!start) return '—';
  const from = new Date(String(start)).getTime();
  const to = end ? new Date(String(end)).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ recheck?: string }> }) {
  const { recheck } = await searchParams;
  const user = await getCurrentUser();
  const ws = user!.workspaceId!;
  const [runs, errors] = await Promise.all([getRuns(ws), getRunErrors(ws)]);

  const errorsByRun = new Map<string, { engine: string; errorCode: string | null; n: number }[]>();
  for (const e of errors) {
    const list = errorsByRun.get(e.runId) ?? [];
    list.push(e);
    errorsByRun.set(e.runId, list);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Runs</h1>
        <p className="text-sm text-muted">Every check, its trigger, cost and per-engine failures. A partial run keeps the engines that responded.</p>
      </div>

      {recheck && <p role="status" className="border-2 border-ink bg-accent px-3 py-2 text-sm">Re-check queued. Refresh in a moment to see the new run and whether your page is cited.</p>}

      {runs.length === 0 ? (
        <EmptyState
          title="No runs yet"
          body="Press “Run now” to send your active prompts to the configured engines. The first run takes about a minute with the mock engine."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse border-2 border-ink bg-surface text-sm">
            <caption className="sr-only">Check runs with status, call counts, cost, duration and per-engine errors</caption>
            <thead>
              <tr className="border-b-2 border-ink bg-third-tint">
                <th scope="col" className="p-2 text-left font-display">Started</th>
                <th scope="col" className="p-2 text-left font-display">Trigger</th>
                <th scope="col" className="p-2 text-left font-display">Status</th>
                <th scope="col" className="p-2 text-left font-display">Engines</th>
                <th scope="col" className="p-2 text-right font-display">Calls</th>
                <th scope="col" className="p-2 text-right font-display">Cost</th>
                <th scope="col" className="p-2 text-right font-display">Duration</th>
                <th scope="col" className="p-2 text-left font-display">Errors</th>
                <th scope="col" className="p-2 text-left font-display"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const runErrors = errorsByRun.get(String(r.id)) ?? [];
                const status = String(r.status);
                return (
                  <tr key={String(r.id)} className="border-b border-ink/20 align-top">
                    <td className="p-2 font-mono text-xs">{new Date(String(r.started_at ?? r.created_at)).toLocaleString()}</td>
                    <td className="p-2"><span className="border border-ink/40 px-1 text-[10px] uppercase">{String(r.trigger)}</span></td>
                    <td className="p-2"><span className={`inline-block px-1.5 py-0.5 text-xs font-bold uppercase ${STATUS_STYLES[status] ?? 'bg-third-tint'}`}>{status}</span></td>
                    <td className="p-2 font-mono text-xs">{(r.engines as string[] | null)?.join(', ') ?? '—'}</td>
                    <td className="p-2 text-right font-mono text-xs">{Number(r.completed_calls)}/{Number(r.planned_calls)}{Number(r.failed_calls) > 0 ? <span className="text-critical"> · {Number(r.failed_calls)} failed</span> : null}</td>
                    <td className="p-2 text-right font-mono text-xs">${Number(r.cost_usd ?? 0).toFixed(2)}</td>
                    <td className="p-2 text-right font-mono text-xs">{duration(r.started_at, r.finished_at)}</td>
                    <td className="p-2 text-xs">
                      {runErrors.length === 0 ? <span className="text-muted">none</span> : (
                        <details>
                          <summary className="cursor-pointer text-critical">{runErrors.reduce((n, e) => n + e.n, 0)} failed</summary>
                          <ul className="mt-1 space-y-0.5">
                            {runErrors.map((e) => <li key={`${e.engine}-${e.errorCode}`} className="font-mono text-[11px]">{e.engine}: {e.errorCode ?? 'error'} ×{e.n}</li>)}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className="p-2">
                      {(status === 'running' || status === 'queued') && (
                        <form action={cancelRunAction}>
                          <input type="hidden" name="runId" value={String(r.id)} />
                          <button type="submit" className="text-xs text-critical underline">Cancel</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
