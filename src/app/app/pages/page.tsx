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

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; type?: string }>;
}) {
  const { owner, type } = await searchParams;
  const user = await getCurrentUser();
  const pages = await getPages(user!.workspaceId!, owner || undefined, type || undefined);

  const qs = (next: { owner?: string; type?: string }) => {
    const params = new URLSearchParams();
    if (next.owner) params.set('owner', next.owner);
    if (next.type) params.set('type', next.type);
    const str = params.toString();
    return str ? `/app/pages?${str}` : '/app/pages';
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Pages</h1>
        <p className="text-sm text-muted">Every URL an engine has returned, tagged as yours, a competitor or a third party. Times cited counts the last 30 days.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1" aria-label="Filter by owner">
          {OWNERS.map((o) => (
            <Link key={o.key} href={qs({ owner: o.key, type })} className={`border-2 border-ink px-2 py-1 text-xs font-bold ${(owner ?? '') === o.key ? 'bg-accent' : 'bg-surface'}`}>
              {o.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Filter by page type">
          {TYPES.map((t) => (
            <Link key={t || 'all'} href={qs({ owner, type: t })} className={`border border-ink/50 px-1.5 py-0.5 font-mono text-[11px] ${(type ?? '') === t ? 'bg-ink text-surface' : 'bg-surface'}`}>
              {t ? `/${t}` : 'all types'}
            </Link>
          ))}
        </div>
      </div>

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
                <th scope="col" className="p-2 text-left font-display">URL</th>
                <th scope="col" className="p-2 text-left font-display">Owner</th>
                <th scope="col" className="p-2 text-left font-display">Type</th>
                <th scope="col" className="p-2 text-right font-display">Cited 30d</th>
                <th scope="col" className="p-2 text-left font-display">Engines</th>
                <th scope="col" className="p-2 text-left font-display">Last fetched</th>
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
