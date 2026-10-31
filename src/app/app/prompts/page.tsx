import Link from 'next/link';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { prompts } from '@/server/db/schema';
import { getCurrentUser } from '@/server/auth/session';
import { addPromptAction, deletePromptAction, togglePromptAction } from '@/app/actions';
import { PLAN_PROMPT_LIMITS } from '@/server/jobs/run-check';
import { workspaces } from '@/server/db/schema';
import { EngineChip } from '@/components/ui';

export const dynamic = 'force-dynamic';

const ENGINES = ['chatgpt', 'claude', 'perplexity', 'gemini'];
const INTENTS = ['pricing', 'comparison', 'alternatives', 'docs', 'howto', 'brand'];

type Latest = { promptId: string; engine: string; status: string; ownCited: boolean; createdAt: string };

export default async function PromptsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await getCurrentUser();
  const ws = user!.workspaceId!;

  const [[wsRow], rows, latestRaw] = await Promise.all([
    db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, ws)).limit(1),
    db.select().from(prompts).where(eq(prompts.workspaceId, ws)).orderBy(prompts.createdAt),
    db.execute(sql`
      select r.prompt_id::text as "promptId", r.engine::text as engine, r.status::text as status,
             coalesce(bool_or(p.owner = 'own') filter (where c.kind = 'cited'), false) as "ownCited",
             r.created_at::text as "createdAt"
      from responses r
      left join citations c on c.response_id = r.id
      left join pages p on p.id = c.page_id
      where r.workspace_id = ${ws}::uuid
      group by r.id, r.prompt_id, r.engine, r.status, r.created_at
      order by r.created_at desc
    `),
  ]);

  const latest = latestRaw as unknown as Latest[];
  const byPromptEngine = new Map<string, Latest>();
  for (const l of latest) {
    const key = `${l.promptId}:${l.engine}`;
    if (!byPromptEngine.has(key)) byPromptEngine.set(key, l);
  }
  const limit = PLAN_PROMPT_LIMITS[wsRow?.plan ?? 'free'];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">Prompts</h1>
          <p className="text-sm text-muted">The exact questions sent to every engine. {rows.filter((p) => p.active).length} active of {limit} allowed on {wsRow?.plan}.</p>
        </div>
        <span className="font-mono text-xs text-muted">{rows.length}/{limit} prompts</span>
      </div>

      {error && <p role="alert" className="border-2 border-critical px-2 py-1 text-sm text-critical">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse border-2 border-ink bg-surface text-sm">
          <caption className="sr-only">Prompt library with latest result per engine</caption>
          <thead>
            <tr className="border-b-2 border-ink bg-third-tint">
              <th scope="col" className="p-2 text-left font-display">Prompt</th>
              <th scope="col" className="p-2 text-left font-display">Intent</th>
              {ENGINES.map((e) => <th key={e} scope="col" className="p-2 text-left"><EngineChip engine={e} /></th>)}
              <th scope="col" className="p-2 text-left font-display">Last run</th>
              <th scope="col" className="p-2 text-left font-display"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="p-4 text-muted">No prompts yet. Add one below.</td></tr>
            )}
            {rows.map((p) => {
              const engineCells = ENGINES.map((e) => byPromptEngine.get(`${p.id}:${e}`));
              const lastRun = engineCells.filter(Boolean).map((c) => c!.createdAt).sort().at(-1);
              return (
                <tr key={p.id} className={`border-b border-ink/20 ${p.active ? '' : 'opacity-50'}`}>
                  <td className="p-2">
                    <Link href={`/app/prompts/${p.id}`} className="font-mono text-xs font-semibold underline-offset-2 hover:underline">{p.text}</Link>
                    {!p.active && <span className="ml-2 border border-ink/40 px-1 text-[10px] uppercase text-muted">inactive</span>}
                  </td>
                  <td className="p-2"><span className="border border-ink/40 px-1 text-[10px] uppercase">{p.intent}</span></td>
                  {engineCells.map((cell, i) => (
                    <td key={ENGINES[i]} className="p-2 font-mono text-xs">
                      {!cell ? <span className="text-muted">—</span>
                        : cell.status === 'error' ? <span className="text-critical" title={cell.status}>✕ error</span>
                        : cell.ownCited ? <span className="text-own" title="your page cited">● own</span>
                        : <span className="text-muted" title="not cited">○ not cited</span>}
                    </td>
                  ))}
                  <td className="p-2 text-xs text-muted">{lastRun ? new Date(lastRun).toLocaleDateString() : 'never'}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <form action={togglePromptAction}>
                        <input type="hidden" name="promptId" value={p.id} />
                        <button type="submit" className="text-xs underline">{p.active ? 'Pause' : 'Activate'}</button>
                      </form>
                      <form action={deletePromptAction}>
                        <input type="hidden" name="promptId" value={p.id} />
                        <button type="submit" className="text-xs text-critical underline">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="brutal max-w-2xl p-4">
        <h2 className="font-display text-lg font-bold">Add a prompt</h2>
        <p className="text-xs text-muted">Sent verbatim to every engine. 8–400 characters. Plan limit {limit}.</p>
        <form action={addPromptAction} className="mt-3 space-y-2">
          <label className="sr-only" htmlFor="text">Prompt</label>
          <input id="text" name="text" required minLength={8} maxLength={400} placeholder="how much does acme cost for a team of 10?"
            className="brutal-flat min-h-11 w-full bg-surface px-3 py-2 font-mono text-sm" />
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="intent">Intent</label>
            <select id="intent" name="intent" defaultValue="pricing" className="brutal-flat min-h-11 bg-surface px-2 text-sm">
              {INTENTS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <button type="submit" className="brutal brutal-hover min-h-11 bg-accent px-4 py-2 font-display font-bold">Add prompt</button>
          </div>
        </form>
      </section>
    </div>
  );
}
