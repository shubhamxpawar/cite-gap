import { getCurrentUser } from '@/server/auth/session';
import { getCompetitors } from '@/server/db/queries';
import { addCompetitorAction, removeCompetitorAction } from '@/app/actions';
import { PLAN_COMPETITOR_LIMITS } from '@/server/jobs/run-check';
import { db } from '@/server/db/client';
import { workspaces } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { EmptyState, OwnerTag, PageTypeChip } from '@/components/ui';

export const dynamic = 'force-dynamic';

const TYPES = ['pricing', 'comparison', 'alternatives', 'docs', 'blog', 'homepage', 'other'];

export default async function CompetitorsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const user = await getCurrentUser();
  const ws = user!.workspaceId!;

  const [{ domains, counts }, [wsRow]] = await Promise.all([
    getCompetitors(ws),
    db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, ws)).limit(1),
  ]);

  const limit = PLAN_COMPETITOR_LIMITS[wsRow?.plan ?? 'free'];
  const own = domains.find((d) => d.role === 'own');
  const competitors = domains.filter((d) => d.role === 'competitor');

  const cell = (hostname: string, type: string) => counts
    .filter((c) => c.hostname === hostname && c.page_type === type)
    .reduce((n, c) => n + Number(c.n), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">Competitors</h1>
          <p className="text-sm text-muted">Head-to-head citation counts by page type. {competitors.length} of {limit} competitors on {wsRow?.plan}.</p>
        </div>
        <span className="font-mono text-xs text-muted">{competitors.length}/{limit}</span>
      </div>

      {error && <p role="alert" className="border-2 border-critical px-2 py-1 text-sm text-critical">{error}</p>}
      {saved && <p role="status" className="border-2 border-own bg-own-tint px-2 py-1 text-sm">Competitor list updated.</p>}

      {!own && (
        <p className="border-2 border-ink bg-accent px-3 py-2 text-sm">Add your own domain in Settings first, so we can separate your pages from competitors.</p>
      )}

      {competitors.length === 0 ? (
        <EmptyState
          title="No competitors yet"
          body="Add the domains that keep winning the questions you care about. We tag every cited URL against this list."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {competitors.map((d) => {
            const host = String(d.hostname);
            const total = TYPES.reduce((n, t) => n + cell(host, t), 0);
            return (
              <section key={String(d.id)} className="brutal p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="mono-url text-base font-bold">{host}</h2>
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted"><OwnerTag owner="competitor" /> {total} citations</p>
                  </div>
                  <form action={removeCompetitorAction}>
                    <input type="hidden" name="domainId" value={String(d.id)} />
                    <button type="submit" className="text-xs text-critical underline">Remove</button>
                  </form>
                </div>
                <table className="mt-3 w-full border-collapse text-sm">
                  <caption className="sr-only">Citations for {host} compared with your pages by page type</caption>
                  <thead>
                    <tr className="border-b-2 border-ink bg-third-tint">
                      <th scope="col" className="p-1.5 text-left font-display">Page type</th>
                      <th scope="col" className="p-1.5 text-right font-display">Them</th>
                      <th scope="col" className="p-1.5 text-right font-display">You</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TYPES.map((t) => {
                      const them = cell(host, t);
                      const us = own ? cell(String(own.hostname), t) : 0;
                      if (them === 0 && us === 0) return null;
                      return (
                        <tr key={t} className="border-b border-ink/15">
                          <th scope="row" className="p-1.5 text-left font-normal"><PageTypeChip type={t} /></th>
                          <td className={`p-1.5 text-right font-mono ${them > us ? 'font-bold text-competitor' : ''}`}>{them}</td>
                          <td className={`p-1.5 text-right font-mono ${us > them ? 'font-bold text-own' : ''}`}>{us}</td>
                        </tr>
                      );
                    })}
                    {total === 0 && <tr><td colSpan={3} className="p-2 text-xs text-muted">No citations captured for this domain yet.</td></tr>}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}

      <section className="brutal max-w-xl p-4">
        <h2 className="font-display text-lg font-bold">Add a competitor</h2>
        <p className="text-xs text-muted">Hostname only, e.g. rival.com. Plan limit {limit}.</p>
        <form action={addCompetitorAction} className="mt-3 flex gap-2">
          <label className="sr-only" htmlFor="hostname">Competitor hostname</label>
          <input id="hostname" name="hostname" required placeholder="rival.com" className="brutal-flat min-h-11 flex-1 bg-surface px-3 py-2 font-mono text-sm" />
          <button type="submit" className="brutal brutal-hover min-h-11 bg-accent px-4 py-2 font-display font-bold">Add</button>
        </form>
      </section>
    </div>
  );
}
