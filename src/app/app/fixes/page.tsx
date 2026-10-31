import Link from 'next/link';
import { getCurrentUser } from '@/server/auth/session';
import { getFixReports } from '@/server/db/queries';
import { EngineChip, EmptyState, PageTypeChip, UrlPill } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATES = [
  { key: '', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Done' },
  { key: 'verified_win', label: 'Verified win' },
  { key: 'not_yet', label: 'Not yet' },
];

export default async function FixesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  const user = await getCurrentUser();
  const reports = await getFixReports(user!.workspaceId!, state || undefined);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">Fix reports</h1>
          <p className="text-sm text-muted">Page-level diagnosis for prompts where a competitor or third party was cited and you were not.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {STATES.map((s) => (
            <Link key={s.key} href={s.key ? `/app/fixes?state=${s.key}` : '/app/fixes'}
              className={`border-2 border-ink px-2 py-1 text-xs font-bold ${(state ?? '') === s.key ? 'bg-accent' : 'bg-surface'}`}>
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          title="No fix reports yet"
          body="After a run, we build a report for each lost prompt (up to 5 per run). Run a check, then come back."
          action={<Link href="/app" className="brutal-flat bg-accent px-4 py-2 font-display font-bold">Back to dashboard ▸</Link>}
        />
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => {
            const winCount = Number(r.win_count ?? 0);
            const doneCount = Number(r.done_count ?? 0);
            const itemCount = Number(r.item_count ?? 0);
            return (
              <li key={String(r.id)} className="brutal p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{String(r.prompt_text)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <EngineChip engine={String(r.engine)} />
                      {Boolean(r.intent) && <PageTypeChip type={String(r.intent)} />}
                      {r.own_url ? <UrlPill url={String(r.own_url)} owner="own" /> : <span className="border border-critical px-1.5 py-0.5 font-bold text-critical">no matching page</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {winCount > 0 && <span className="border-2 border-ink bg-own px-2 py-0.5 text-xs font-bold text-surface">✓ verified win</span>}
                    {doneCount > 0 && winCount === 0 && <span className="border border-ink bg-accent px-2 py-0.5 text-xs font-bold">{doneCount} done</span>}
                    <span className="font-mono text-xs text-muted">{itemCount} items</span>
                    <Link href={`/app/fixes/${r.id}`} className="brutal-flat bg-accent px-2.5 py-1 text-xs font-bold hover:bg-ink hover:text-surface">Open ▸</Link>
                  </div>
                </div>
                {Boolean(r.summary) && <p className="mt-2 border-t border-ink/15 pt-2 text-xs text-muted">{String(r.summary)}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
