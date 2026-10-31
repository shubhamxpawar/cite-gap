import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { fixReports } from '@/server/db/schema';
import { getCurrentUser } from '@/server/auth/session';
import { getPromptDetail } from '@/server/db/queries';
import { AnswerWithCitations } from '@/components/answer-with-citations';
import { EngineChip, SourceBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PromptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ engine?: string }>;
}) {
  const { id } = await params;
  const { engine: requested } = await searchParams;
  const user = await getCurrentUser();
  const ws = user!.workspaceId!;
  const detail = await getPromptDetail(ws, id);
  if (!detail) notFound();

  const engineIds = Object.keys(detail.engines);
  const engine = requested && detail.engines[requested] ? requested : engineIds[0];
  const active = engine ? detail.engines[engine] : undefined;

  const [report] = engine
    ? await db
        .select({ id: fixReports.id })
        .from(fixReports)
        .where(and(eq(fixReports.workspaceId, ws), eq(fixReports.promptId, id), eq(fixReports.engine, engine as 'chatgpt')))
        .orderBy(desc(fixReports.createdAt))
        .limit(1)
    : [];

  const ownCited = active?.citations.some((c) => c.kind === 'cited' && c.owner === 'own') ?? false;
  const history = detail.history.filter((h) => h.engine === engine).slice(0, 8).reverse();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/app/prompts" className="text-xs underline">← All prompts</Link>
          <h1 className="mt-1 max-w-3xl font-mono text-lg font-bold leading-6">{detail.prompt.text}</h1>
          <p className="mt-1 text-xs text-muted">Intent: {detail.prompt.intent} · answers are single samples</p>
        </div>
        {report ? (
          <Link href={`/app/fixes/${report.id}`} className="brutal-flat bg-accent px-3 py-2 text-sm font-bold hover:bg-ink hover:text-surface">Open fix report ▸</Link>
        ) : (
          <span className="brutal-flat cursor-not-allowed bg-third-tint px-3 py-2 text-sm text-muted" title={ownCited ? 'Your page is already cited for this prompt and engine.' : 'A fix report is generated for lost prompts after a run.'}>
            {ownCited ? 'Your page is cited' : 'No fix report yet'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {engineIds.map((e) => (
          <Link key={e} href={`/app/prompts/${id}?engine=${e}`} className={`border-2 border-ink px-2 py-1 ${e === engine ? 'bg-accent' : 'bg-surface'}`}>
            <EngineChip engine={e} />
          </Link>
        ))}
        {engineIds.length === 0 && <p className="text-sm text-muted">No responses yet. Run a check.</p>}
      </div>

      {active && (
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge model={active.model} date={new Date(active.createdAt).toLocaleDateString()} />
              {active.status === 'error' && <span className="border border-critical px-1.5 py-0.5 text-xs text-critical">engine error</span>}
              {ownCited ? <span className="border border-own bg-own-tint px-1.5 py-0.5 text-xs font-bold text-own">✓ your page cited</span> : <span className="border border-ink/40 bg-third-tint px-1.5 py-0.5 text-xs">not cited</span>}
            </div>
            <AnswerWithCitations text={active.answerText ?? ''} citations={active.citations} />
            {active.searchQueries.length > 0 && (
              <details className="border-2 border-ink bg-surface p-3 text-xs">
                <summary className="cursor-pointer font-medium">Search queries the engine issued ({active.searchQueries.length})</summary>
                <ul className="mt-2 space-y-1 font-mono">
                  {active.searchQueries.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </details>
            )}
          </div>

          <aside className="space-y-3">
            <div className="brutal p-3">
              <h2 className="font-display text-sm font-bold">Citation history</h2>
              <p className="text-[11px] text-muted">Oldest → newest, last 8 runs for this engine.</p>
              <div className="mt-2 flex gap-1">
                {history.map((h, i) => (
                  <span key={`${h.runId}-${i}`} title={h.ownCited ? 'own page cited' : 'not cited'}
                    className={`size-5 border border-ink ${h.ownCited ? 'bg-own' : 'bg-third-tint'}`} />
                ))}
                {history.length === 0 && <span className="text-xs text-muted">No completed runs yet.</span>}
              </div>
            </div>
            <div className="brutal p-3 text-xs text-muted">
              <h2 className="font-display text-sm font-bold text-ink">How to read this</h2>
              <p className="mt-1">A citation is one observation from one sample. The same prompt can cite different pages tomorrow. Use the fix report to compare pages, not to predict rankings.</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
