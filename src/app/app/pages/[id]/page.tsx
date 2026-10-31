import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { getPageHistory } from '@/server/db/queries';
import { Disclaimer, OwnerTag, PageTypeChip, UrlPill } from '@/components/ui';

export const dynamic = 'force-dynamic';

const LABELS: Record<string, string> = {
  httpStatus: 'HTTP status',
  noindex: 'noindex',
  canonicalMismatch: 'Canonical mismatch',
  likelyJsRendered: 'Likely JS-rendered',
  wordCount: 'Words',
  h1Count: 'H1 count',
  questionHeadings: 'Question headings',
  tables: 'Tables',
  priceTokens: 'Price tokens',
  planNames: 'Plan names',
  codeBlocks: 'Code blocks',
  jsonLdTypes: 'JSON-LD types',
  visibleDate: 'Visible date',
  dateModified: 'dateModified',
  metaDescriptionLen: 'Meta description length',
  titleLen: 'Title length',
  outboundLinks: 'Outbound links',
  robots: 'robots.txt for AI bots',
};

function fmt(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default async function PageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const { page, weeks, snapshots } = await getPageHistory(user!.workspaceId!, id);
  if (!page) notFound();

  const maxWeek = Math.max(1, ...weeks.map((w) => w.n));
  const latest = snapshots[0];
  const latestFeatures = (latest?.features ?? null) as Record<string, unknown> | null;
  const previous = snapshots[1];
  const previousFeatures = (previous?.features ?? null) as Record<string, unknown> | null;

  const changed = latestFeatures && previousFeatures
    ? Object.keys({ ...latestFeatures, ...previousFeatures }).filter((key) => JSON.stringify(latestFeatures[key] ?? null) !== JSON.stringify(previousFeatures[key] ?? null))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/pages" className="text-xs underline">← All pages</Link>
        <h1 className="mt-1 max-w-3xl"><UrlPill url={String(page.url_normalized)} owner={page.owner as 'own'} pageType={String(page.page_type)} /></h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <OwnerTag owner={page.owner as 'own'} />
          <PageTypeChip type={String(page.page_type)} />
          <span>HTTP {String(page.http_status ?? '—')}</span>
          <span>· last fetched {page.last_fetched_at ? new Date(String(page.last_fetched_at)).toLocaleString() : 'never'}</span>
        </div>
        {page.title ? <p className="mt-1 text-sm text-muted">{String(page.title)}</p> : null}
      </div>

      <section className="brutal p-4">
        <h2 className="font-display text-lg font-bold">Citations by week</h2>
        <p className="text-xs text-muted">Each bar is the number of responses that cited this URL, grouped by ISO week.</p>
        {weeks.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Not cited in any completed run yet. {page.owner === 'own' ? 'Use a fix report to see what to change.' : 'It may still have been retrieved without being cited.'}</p>
        ) : (
          <div className="mt-4 flex items-end gap-2 overflow-x-auto pb-1">
            {weeks.map((w) => (
              <div key={w.week} className="flex w-12 shrink-0 flex-col items-center gap-1">
                <span className="font-mono text-xs">{w.n}</span>
                <div className="flex h-28 w-8 items-end border border-ink bg-surface" title={`${w.n} citations in week of ${w.week}`}>
                  <span className="w-full bg-own" style={{ height: `${Math.max(6, (w.n / maxWeek) * 100)}%` }} />
                </div>
                <span className="font-mono text-[10px] text-muted">{w.week.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="brutal p-4">
        <h2 className="font-display text-lg font-bold">Snapshots</h2>
        <p className="text-xs text-muted">We fetch cited pages and store measured features. A diff proves a change shipped since the last check.</p>

        {snapshots.length === 0 && <p className="mt-3 text-sm text-muted">No snapshot yet. Snapshots are captured when a fix report needs the page.</p>}

        {latestFeatures && (
          <div className="mt-3">
            <h3 className="font-display text-sm font-bold">What changed since the previous snapshot</h3>
            {changed.length === 0 ? (
              <p className="mt-1 text-sm text-muted">{previousFeatures ? 'No feature changed between the last two snapshots.' : 'Only one snapshot so far — nothing to compare yet.'}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {changed.map((key) => (
                  <li key={key} className="flex flex-wrap items-baseline gap-2 border-b border-ink/15 pb-1">
                    <span className="font-medium">{LABELS[key] ?? key}</span>
                    <span className="font-mono text-xs text-muted line-through">{fmt(previousFeatures?.[key])}</span>
                    <span aria-hidden>→</span>
                    <span className="font-mono text-xs font-bold">{fmt(latestFeatures[key])}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {snapshots.length > 0 && (
          <ul className="mt-4 space-y-2">
            {snapshots.map((snap) => (
              <li key={String(snap.id)} className="border border-ink/30 bg-bg p-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono">{new Date(String(snap.fetched_at)).toLocaleString()}</span>
                  <span className="text-muted">HTTP {String(snap.http_status ?? '—')} · hash {String(snap.content_hash ?? '—').slice(0, 10)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {latestFeatures && (
        <section className="brutal p-4">
          <h2 className="font-display text-lg font-bold">Latest measured features</h2>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {Object.keys(LABELS).map((key) => (
              <div key={key} className="flex items-baseline justify-between gap-3 border-b border-ink/15 py-1">
                <dt className="text-muted">{LABELS[key]}</dt>
                <dd className="font-mono text-xs">{fmt(latestFeatures[key])}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <Disclaimer>Features are measured from a single fetch. Pages that render content client-side may look emptier than they do in a browser.</Disclaimer>
    </div>
  );
}
