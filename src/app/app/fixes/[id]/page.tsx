import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { getCurrentUser } from '@/server/auth/session';
import { getFixReport } from '@/server/db/queries';
import { markFixItemAction, recheckReportAction } from '@/app/actions';
import { CopyButton } from '@/components/copy-button';
import { Disclaimer, EffortChip, EngineChip, PageTypeChip, SeverityBadge, UrlPill } from '@/components/ui';
import { track } from '@/server/analytics';

export const dynamic = 'force-dynamic';

type Report = Record<string, unknown>;
type Item = Record<string, unknown>;
type Winner = Record<string, unknown>;

const FEATURE_ROWS: [string, string][] = [
  ['httpStatus', 'HTTP status'],
  ['noindex', 'noindex'],
  ['canonicalMismatch', 'Canonical mismatch'],
  ['likelyJsRendered', 'Likely JS-rendered'],
  ['wordCount', 'Words'],
  ['h1Count', 'H1 count'],
  ['questionHeadings', 'Question headings'],
  ['tables', 'Tables'],
  ['priceTokens', 'Price tokens'],
  ['planNames', 'Plan names'],
  ['codeBlocks', 'Code blocks'],
  ['jsonLdTypes', 'JSON-LD types'],
  ['visibleDate', 'Visible date'],
  ['dateModified', 'dateModified'],
  ['metaDescriptionLen', 'Meta description length'],
  ['titleLen', 'Title length'],
  ['outboundLinks', 'Outbound links'],
  ['robots', 'robots.txt for AI bots'],
];

function fmt(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') || '—';
  }
  return String(value);
}

async function latestFeatures(pageId: string | null): Promise<Record<string, unknown> | null> {
  if (!pageId) return null;
  const rows = (await db.execute(sql`
    select features from page_snapshots where page_id = ${pageId}::uuid order by fetched_at desc limit 1
  `)) as unknown as { features: Record<string, unknown> }[];
  return rows[0]?.features ?? null;
}

export default async function FixReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const data = await getFixReport(user!.workspaceId!, id);
  if (!data) notFound();

  track('fix_opened', { workspaceId: user!.workspaceId, reportId: id });
  const report = data.report as Report;
  const winners = data.winners as Winner[];
  const items = data.items as Item[];
  const ownPageId = (report.own_page_id as string | null) ?? null;
  const winner = winners[0];

  const [winnerFeatures, ownFeatures] = await Promise.all([
    latestFeatures((winner?.id as string) ?? null),
    latestFeatures(ownPageId),
  ]);

  const rows = FEATURE_ROWS.map(([key, label]) => {
    const w = winnerFeatures?.[key];
    const o = ownFeatures?.[key];
    const same = JSON.stringify(w ?? null) === JSON.stringify(o ?? null);
    return { key, label, winner: fmt(w), own: ownPageId ? fmt(o) : 'no page', same };
  });
  const diffs = rows.filter((r) => !r.same);
  const same = rows.filter((r) => r.same);
  const deterministicOnly = String(report.llm_model ?? '') === 'deterministic';
  const winnerUnfetchable = !winnerFeatures;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/app/fixes" className="text-xs underline">← All fix reports</Link>
          <h1 className="mt-1 max-w-3xl font-mono text-lg font-bold leading-6">{String(report.prompt_text)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <EngineChip engine={String(report.engine)} />
            <span>{String(report.llm_model ?? '')}</span>
            <span>· run {new Date(String(report.run_created_at)).toLocaleDateString()}</span>
          </div>
        </div>
        <form action={recheckReportAction}>
          <button type="submit" className="brutal brutal-hover min-h-10 bg-accent px-3 py-1.5 font-display text-sm font-bold">Re-check now ▸</button>
        </form>
      </div>

      {winnerUnfetchable && (
        <p className="border-2 border-ink bg-accent px-3 py-2 text-sm">Couldn&rsquo;t fetch the competitor page (blocked, JS-only, or offline). The report uses the answer excerpt and the features we could observe.</p>
      )}
      {deterministicOnly && (
        <p className="border-2 border-ink bg-third-tint px-3 py-2 text-sm">Deterministic analysis only — no LLM key is configured. Findings come from measurable feature differences, not prose analysis.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border-2 border-ink bg-competitor-tint p-3">
          <p className="text-xs font-bold uppercase">Winner</p>
          {winner ? (
            <div className="mt-1"><UrlPill url={String(winner.url_normalized)} owner="third_party" pageType={String(winner.page_type)} /></div>
          ) : <p className="mt-1 text-sm text-muted">No winner captured</p>}
          {winners.length > 1 && <p className="mt-1 text-xs text-muted">+{winners.length - 1} more cited URL{winners.length > 2 ? 's' : ''}</p>}
        </div>
        <div className={`border-2 border-ink p-3 ${ownPageId ? 'bg-own-tint' : 'bg-critical/10'}`}>
          <p className="text-xs font-bold uppercase">Your page</p>
          {report.own_url ? (
            <div className="mt-1"><UrlPill url={String(report.own_url)} owner="own" /></div>
          ) : (
            <p className="mt-1 font-display font-bold text-critical">No matching page exists</p>
          )}
        </div>
      </div>

      <section>
        <h2 className="font-display text-lg font-bold">Why you lost — evidence</h2>
        <p className="text-xs text-muted">Measured on the fetched pages. Differences first; identical rows are collapsed.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse border-2 border-ink bg-surface text-sm">
            <caption className="sr-only">Feature comparison between the cited page and your page</caption>
            <thead>
              <tr className="border-b-2 border-ink bg-third-tint">
                <th scope="col" className="p-2 text-left font-display">Feature</th>
                <th scope="col" className="p-2 text-left font-display">Winner</th>
                <th scope="col" className="p-2 text-left font-display">You</th>
                <th scope="col" className="p-2 text-left font-display">Δ</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((r) => (
                <tr key={r.key} className="border-b border-ink/20 bg-accent/10 font-medium">
                  <th scope="row" className="p-2 text-left">{r.label}</th>
                  <td className="p-2 font-mono text-xs">{r.winner}</td>
                  <td className="p-2 font-mono text-xs">{r.own}</td>
                  <td className="p-2 text-xs font-bold text-competitor">◀ gap</td>
                </tr>
              ))}
              {diffs.length === 0 && (
                <tr><td colSpan={4} className="p-3 text-sm text-muted">No measurable differences found in the features we can check. The gap may be in content substance, which needs the LLM analysis.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {same.length > 0 && (
          <details className="mt-2 border-2 border-ink bg-surface p-2 text-xs">
            <summary className="cursor-pointer font-medium">Identical features ({same.length})</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {same.map((r) => <li key={r.key}><strong>{r.label}:</strong> {r.winner}</li>)}
            </ul>
          </details>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Fix checklist</h2>
          <span className="font-mono text-xs text-muted">{items.filter((i) => i.state === 'done').length}/{items.length} done</span>
        </div>
        <p className="text-xs text-muted">Sorted by severity, then effort. Check an item when shipped; the next run re-checks whether your page is cited.</p>
        <ul className="mt-2 space-y-2">
          {items.map((item) => {
            const done = item.state === 'done' || item.state === 'verified_win';
            return (
              <li key={String(item.id)} className={`brutal p-3 ${done ? 'bg-own-tint/40' : 'bg-surface'}`}>
                <div className="flex items-start gap-3">
                  <form action={markFixItemAction} className="pt-0.5">
                    <input type="hidden" name="itemId" value={String(item.id)} />
                    <input type="hidden" name="reportId" value={id} />
                    <input type="hidden" name="done" value={done ? '0' : '1'} />
                    <button type="submit" aria-label={done ? 'Mark not done' : 'Mark done'}
                      className={`flex size-6 items-center justify-center border-2 border-ink font-bold ${done ? 'bg-own text-surface' : 'bg-surface hover:bg-accent'}`}>
                      {done ? '✓' : ''}
                    </button>
                  </form>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={String(item.severity)} />
                      <EffortChip effort={String(item.effort)} />
                      <span className="border border-ink/40 px-1 text-[10px] uppercase text-muted">{String(item.category)}</span>
                      <span className="border border-ink/40 px-1 text-[10px] uppercase text-muted">{String(item.source)}</span>
                      {item.state === 'verified_win' && <span className="bg-own px-1.5 text-[10px] font-bold uppercase text-surface">verified win</span>}
                      {item.state === 'not_yet' && <span className="bg-third-tint px-1.5 text-[10px] font-bold uppercase">not yet cited</span>}
                    </div>
                    <p className="mt-1 font-display font-bold">{String(item.title)}</p>
                    {Boolean(item.evidence) && <p className="mt-1 text-xs text-muted">Evidence: <span className="text-ink">{String(item.evidence)}</span></p>}
                    <p className="mt-1 text-sm">{String(item.recommendation)}</p>
                    {Boolean(item.suggested_copy) && (
                      <details className="mt-2 border border-ink/30 bg-bg p-2 text-xs">
                        <summary className="flex cursor-pointer items-center justify-between gap-2 font-medium">
                          Suggested copy
                          <CopyButton value={String(item.suggested_copy)} label="suggested copy" />
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{String(item.suggested_copy)}</pre>
                      </details>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {items.length === 0 && <li className="brutal p-3 text-sm text-muted">No fix items were produced. Retry the analysis or check the page fetch.</li>}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Disclaimer>
          Differences vs the cited page — not a guarantee of citation. Samples are noisy; compare runs before making large changes.
        </Disclaimer>
        <div className="flex items-center gap-2">
          {Boolean(report.intent) && <PageTypeChip type={String(report.intent)} />}
          <Link href={`/app/prompts/${String(report.prompt_id ?? '')}`} className="text-xs underline">View full answer</Link>
        </div>
      </div>
    </div>
  );
}
