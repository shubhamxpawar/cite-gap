import Link from 'next/link';
import { getCurrentUser } from '@/server/auth/session';
import { getPages } from '@/server/db/queries';
import { EngineChip, EmptyState, OwnerTag, PageTypeChip, UrlPill } from '@/components/ui';

export const dynamic = 'force-dynamic';

const OWNERS = [
  { key: '', label: 'All owners' },
  { key: 'own', label: 'Yours' },
  { key: 'competitor', label: 'Competitors' },
  { key: 'third_party', label: 'Third-party' },
];

const TYPES = ['', 'pricing', 'docs', 'comparison', 'alternatives', 'blog', 'changelog', 'integrations', 'homepage', 'other'];
const SORTS = ['url', 'owner', 'type', 'cited30d', 'engines', 'fetched'] as const;
type SortKey = (typeof SORTS)[number];
const NATURAL_DIR: Record<SortKey, 'asc' | 'desc'> = {
  url: 'asc',
  owner: 'asc',
  type: 'asc',
  cited30d: 'desc',
  engines: 'desc',
  fetched: 'desc',
};

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; type?: string; sort?: string; dir?: string }>;
}) {
  const { owner, type, sort: sortParam, dir: dirParam } = await searchParams;
  const user = await getCurrentUser();
  const sort = (SORTS as readonly string[]).includes(sortParam ?? '') ? (sortParam as SortKey) : undefined;
  const dir = dirParam === 'asc' || dirParam === 'desc' ? dirParam : undefined;
  const pages = await getPages(user!.workspaceId!, owner || undefined, type || undefined, sort, dir);

  const qs = (next: { owner?: string; type?: string; sort?: string; dir?: string }) => {
    const params = new URLSearchParams();
    if (next.owner) params.set('owner', next.owner);
    if (next.type) params.set('type', next.type);
    if (next.sort) params.set('sort', next.sort);
    if (next.dir) params.set('dir', next.dir);
    const str = params.toString();
    return str ? `/app/pages?${str}` : '/app/pages';
  };

  // Clicking a column header: same column toggles direction, a new column uses its natural default.
  const sortHref = (key: SortKey) => {
    const isSame = sort === key;
    const nextDir = isSame ? ((dir ?? NATURAL_DIR[key]) === 'asc' ? 'desc' : 'asc') : NATURAL_DIR[key];
    return qs({ owner, type, sort: key, dir: nextDir });
  };
  const sortMark = (key: SortKey) => (sort === key ? ((dir ?? NATURAL_DIR[key]) === 'asc' ? ' ▲' : ' ▼') : ' ↕');
  const ariaSort = (key: SortKey): 'ascending' | 'descending' | undefined =>
    sort === key ? ((dir ?? NATURAL_DIR[key]) === 'asc' ? 'ascending' : 'descending') : undefined;

  const SortTh = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <th scope="col" aria-sort={ariaSort(k)} className={`p-0 ${className ?? ''}`}>
      <Link
        href={sortHref(k)}
        prefetch={false}
        scroll={false}
        className={`flex h-full items-center gap-1 p-2 font-display ${sort === k ? 'bg-accent/40 underline underline-offset-2' : 'hover:bg-third-tint'} ${className?.includes('text-right') ? 'justify-end' : ''}`}
      >
        {label}<span aria-hidden className="text-[10px]">{sortMark(k)}</span>
      </Link>
    </th>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Pages</h1>
        <p className="text-sm text-muted">Every URL an engine has returned, tagged as yours, a competitor or a third party. Times cited counts the last 30 days.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1" aria-label="Filter by owner">
          {OWNERS.map((o) => (
            <Link key={o.key} href={qs({ owner: o.key, type, sort, dir })} scroll={false} className={`border-2 border-ink px-2 py-1 text-xs font-bold ${(owner ?? '') === o.key ? 'bg-accent' : 'bg-surface'}`}>
              {o.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Filter by page type">
          {TYPES.map((t) => (
            <Link key={t || 'all'} href={qs({ owner, type: t, sort, dir })} scroll={false} className={`border border-ink/50 px-1.5 py-0.5 font-mono text-[11px] ${(type ?? '') === t ? 'bg-ink text-surface' : 'bg-surface'}`}>
              {t ? `/${t}` : 'all types'}
            </Link>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">Default order: <span className="font-medium">yours → competitor → third-party</span>, and within a type <span className="font-medium">pricing → comparison → blog → other</span>. Click any column header to sort; click again to reverse.</p>

      {pages.length === 0 ? (
        <EmptyState
          title="No pages captured yet"
          body="Pages appear after a run, once an engine cites or retrieves a URL. Run a check to populate this list."
          action={<Link href="/app" className="brutal-flat bg-accent px-4 py-2 font-display font-bold">Back to dashboard ▸</Link>}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse border-2 border-ink bg-surface text-sm">
            <caption className="sr-only">Captured pages with owner, type, citation count and last fetch</caption>
            <thead>
              <tr className="border-b-2 border-ink bg-third-tint">
                <SortTh label="URL" k="url" />
                <SortTh label="Owner" k="owner" />
                <SortTh label="Type" k="type" />
                <SortTh label="Cited 30d" k="cited30d" className="text-right" />
                <SortTh label="Engines" k="engines" />
                <SortTh label="Last fetched" k="fetched" />
                <th scope="col" className="p-2 text-left font-display"><span className="sr-only">Detail</span></th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => {
                const engines = (p.engines as string[] | null) ?? [];
                return (
                  <tr key={String(p.id)} className="border-b border-ink/20">
                    <td className="max-w-[360px] p-2">
                      <UrlPill url={String(p.url_normalized)} owner={p.owner as 'own'} />
                      {p.title ? <p className="mt-0.5 truncate text-xs text-muted">{String(p.title)}</p> : null}
                    </td>
                    <td className="p-2"><OwnerTag owner={p.owner as 'own'} /></td>
                    <td className="p-2"><PageTypeChip type={String(p.page_type)} /></td>
                    <td className="p-2 text-right font-mono">{Number(p.cited_30d ?? 0)}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">{engines.map((e) => <EngineChip key={e} engine={e} />)}</div>
                    </td>
                    <td className="p-2 text-xs text-muted">{p.last_fetched_at ? new Date(String(p.last_fetched_at)).toLocaleDateString() : 'not fetched'}</td>
                    <td className="p-2"><Link href={`/app/pages/${p.id}`} className="text-xs underline">Open</Link></td>
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
