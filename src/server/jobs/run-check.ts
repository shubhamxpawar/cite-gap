// Run orchestration — docs/01-TRD.md §6 + docs/02-App-Flow.md F3 state machine.
import { inngest } from './inngest';
import { db } from '@/server/db/client';
import { checkRuns, prompts, workspaces, workspaceBudgets, responses, pages, citations } from '@/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getEngineById, type ConfiguredEngine } from '@/server/engines';
import { dispatchEvent } from './dispatch';
import { normalizeUrl } from '@/server/pipeline/normalize-url';
import { classifyPage, ownershipOf } from '@/server/pipeline/classify-page';
import { track } from '@/server/analytics';

export const PLAN_CAPS_USD: Record<string, number> = { free: 2, starter: 9, growth: 30 };
export const PLAN_PROMPT_LIMITS: Record<string, number> = { free: 8, starter: 25, growth: 100 };
export const PLAN_COMPETITOR_LIMITS: Record<string, number> = { free: 2, starter: 2, growth: 5 };

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7) + '-01';
}

async function budgetGuard(workspaceId: string, estimatedUsd: number): Promise<{ ok: true } | { ok: false; reason: 'BUDGET_EXCEEDED' }> {
  const month = currentMonth();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const cap = PLAN_CAPS_USD[ws?.plan ?? 'free'];
  const [budget] = await db
    .select()
    .from(workspaceBudgets)
    .where(and(eq(workspaceBudgets.workspaceId, workspaceId), eq(workspaceBudgets.month, month)))
    .limit(1);
  if (!budget) {
    await db.insert(workspaceBudgets).values({ workspaceId, month, capUsd: String(cap) }).onConflictDoNothing();
    return { ok: true };
  }
  if (Number(budget.spentUsd) + estimatedUsd > Number(budget.capUsd)) return { ok: false, reason: 'BUDGET_EXCEEDED' };
  return { ok: true };
}

export const runCheckJob = inngest.createFunction(
  { id: 'run-check', retries: 1 },
  { event: 'check/run.requested' },
  async ({ event, step }) => {
    const { runId } = event.data as { runId: string; workspaceId: string; trigger: string };

    const run = await step.run('load-run', async () => {
      const [r] = await db.select().from(checkRuns).where(eq(checkRuns.id, runId)).limit(1);
      if (!r) throw new Error('run not found');
      return r;
    });

    const promptRows = await step.run('load-prompts', () =>
      db.select().from(prompts).where(and(eq(prompts.workspaceId, run.workspaceId), eq(prompts.active, true))),
    );

    const planned = promptRows.length * run.engines.length * run.samplesPerPrompt;
    const guard = await step.run('budget-guard', async () => {
      const result = await budgetGuard(run.workspaceId, planned * 0.01);
      if (!result.ok) {
        await db.update(checkRuns).set({ status: 'failed', finishedAt: new Date() }).where(eq(checkRuns.id, runId));
        return result;
      }
      await db.update(checkRuns).set({ status: 'running', startedAt: new Date(), plannedCalls: planned }).where(eq(checkRuns.id, runId));
      return result;
    });
    if (!guard.ok) return { status: 'failed' as const, reason: guard.reason };

    if (promptRows.length === 0) {
      await db.update(checkRuns).set({ status: 'succeeded', finishedAt: new Date() }).where(eq(checkRuns.id, runId));
      return { status: 'succeeded' as const, planned: 0 };
    }

    // fan-out per (prompt, engine, sample)
    await step.sendEvent(
      'fan-out',
      promptRows.flatMap((p) =>
        run.engines.flatMap((engine) =>
          Array.from({ length: run.samplesPerPrompt }, (_, sampleIdx) => ({
            name: 'run-prompt-engine/requested' as const,
            data: { runId, workspaceId: run.workspaceId, promptId: p.id, engine, sampleIdx },
          })),
        ),
      ),
    );
    return { status: 'running' as const, fannedOut: planned };
  },
);

// createRun helper used by server actions ("Run now", onboarding, audit)
export async function createRun(
  workspaceId: string,
  trigger: 'manual' | 'schedule' | 'audit' | 'onboarding',
  engines: ('chatgpt' | 'claude' | 'perplexity' | 'gemini')[],
  samplesPerPrompt = 1,
) {
  const [run] = await db
    .insert(checkRuns)
    .values({
      workspaceId,
      trigger,
      engines,
      samplesPerPrompt,
      systemPrompt: 'Answer concisely with sources.',
    })
    .returning({ id: checkRuns.id });
  track('run_started', { runId: run.id, workspaceId, trigger, engines });
  await dispatchEvent('check/run.requested', { runId: run.id, workspaceId, trigger });
  return run.id;
}

// charge budget after a call completes
export async function chargeBudget(workspaceId: string, costUsd: number) {
  const month = currentMonth();
  const [ws] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const cap = PLAN_CAPS_USD[ws?.plan ?? 'free'];
  await db
    .insert(workspaceBudgets)
    .values({ workspaceId, month, capUsd: String(cap), spentUsd: String(costUsd) })
    .onConflictDoUpdate({
      target: [workspaceBudgets.workspaceId, workspaceBudgets.month],
      set: { spentUsd: sql`${workspaceBudgets.spentUsd} + ${String(costUsd)}` },
    });
}

export const runPromptEngineJob = inngest.createFunction(
  {
    id: 'run-prompt-engine',
    retries: 3,
    concurrency: [{ limit: 10 }, { limit: 3, key: 'event.data.workspaceId' }],
  },
  { event: 'run-prompt-engine/requested' },
  async ({ event, step }) => {
    const { runId, workspaceId, promptId, engine, sampleIdx } = event.data as {
      runId: string; workspaceId: string; promptId: string;
      engine: 'chatgpt' | 'claude' | 'perplexity' | 'gemini'; sampleIdx: number;
    };

    // idempotency: unique (run_id, prompt_id, engine, sample_idx)
    const existing = await step.run('check-existing', () =>
      db
        .select({ id: responses.id })
        .from(responses)
        .where(and(eq(responses.runId, runId), eq(responses.promptId, promptId), eq(responses.engine, engine), eq(responses.sampleIdx, sampleIdx)))
        .limit(1),
    );
    if (existing.length) return { skipped: true };

    const [prompt] = await step.run('load-prompt', () => db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1));
    if (!prompt) return { status: 'missing_prompt' as const };

    const ownDomainRow = await step.run('load-own-domain', async () => {
      const r = await db.execute(sql`select hostname from domains where workspace_id = ${workspaceId}::uuid and role = 'own' limit 1`);
      return ((r as unknown as { hostname: string }[])[0]?.hostname) ?? '';
    });
    const competitorRows = await step.run('load-competitors', async () => {
      const r = await db.execute(sql`select hostname from domains where workspace_id = ${workspaceId}::uuid and role = 'competitor'`);
      return (r as unknown as { hostname: string }[]).map((x) => x.hostname);
    });

    const adapter: ConfiguredEngine | null = getEngineById(engine, {
      ownDomains: ownDomainRow ? [ownDomainRow] : [],
      competitorDomains: competitorRows,
    });
    if (!adapter) {
      await step.run('record-disabled', async () => {
        await db.insert(responses).values({
          workspaceId, runId, promptId, engine, sampleIdx, model: 'disabled', status: 'error', errorCode: 'ENGINE_DISABLED',
        }).onConflictDoNothing();
        await db.update(checkRuns).set({ failedCalls: sql`${checkRuns.failedCalls} + 1` }).where(eq(checkRuns.id, runId));
      });
      await step.run('maybe-finalize', () => finalizeIfDone(runId, workspaceId));
      return { status: 'engine_disabled' as const };
    }

    const outcome = await step.run('call-engine', async (): Promise<{ ok: true; result: Awaited<ReturnType<ConfiguredEngine['run']>> } | { ok: false; error: string }> => {
      try {
        return { ok: true, result: await adapter.run(prompt.text, { timeoutMs: 45_000 }) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    await step.run('persist', async () => {
      if (!outcome.ok) {
        await db.insert(responses).values({
          workspaceId, runId, promptId, engine, sampleIdx,
          model: adapter.model, status: 'error', errorCode: outcome.error,
        }).onConflictDoNothing();
        await db.update(checkRuns).set({ failedCalls: sql`${checkRuns.failedCalls} + 1` }).where(eq(checkRuns.id, runId));
        return;
      }
      const r = outcome.result;
      const [resp] = await db
        .insert(responses)
        .values({
          workspaceId, runId, promptId, engine, sampleIdx, model: r.model, status: 'ok',
          answerText: r.answerText, searchQueries: r.searchQueries, raw: r.raw as object,
          latencyMs: r.latencyMs, costUsd: String(r.costUsd),
        })
        .onConflictDoNothing()
        .returning({ id: responses.id });
      if (!resp) return;

      for (const c of r.citations) {
        const norm = normalizeUrl(c.url);
        const owner = ownershipOf(norm, ownDomainRow, competitorRows);
        const pageType = classifyPage(norm, c.title);
        const [page] = await db
          .insert(pages)
          .values({
            workspaceId, urlNormalized: norm, hostname: new URL(norm).host,
            pageType, owner, discoveredVia: 'citation', title: c.title ?? null,
          })
          .onConflictDoUpdate({ target: [pages.workspaceId, pages.urlNormalized], set: { title: c.title ?? null } })
          .returning({ id: pages.id });
        await db.insert(citations).values({
          workspaceId, responseId: resp.id, pageId: page.id, urlRaw: c.url,
          kind: c.kind, position: c.position, citedText: c.citedText ?? null,
        });
      }
      await db.update(checkRuns).set({
        completedCalls: sql`${checkRuns.completedCalls} + 1`,
        costUsd: sql`${checkRuns.costUsd} + ${String(r.costUsd)}`,
      }).where(eq(checkRuns.id, runId));
      await chargeBudget(workspaceId, r.costUsd);
    });

    await step.run('maybe-finalize', () => finalizeIfDone(runId, workspaceId));
    return { done: true };
  },
);

async function finalizeIfDone(runId: string, workspaceId: string) {
  const [r] = await db.select().from(checkRuns).where(eq(checkRuns.id, runId)).limit(1);
  if (!r || r.status !== 'running') return;
  if (r.completedCalls + r.failedCalls < r.plannedCalls) return;
  const status = r.failedCalls === 0 ? 'succeeded' : r.completedCalls > 0 ? 'partial' : 'failed';
  await db.update(checkRuns).set({ status, finishedAt: new Date() }).where(eq(checkRuns.id, runId));
  track('run_completed', { runId, workspaceId, status, completed: r.completedCalls, failed: r.failedCalls });
  if (status !== 'failed') {
    await dispatchEvent('fix-report/build.requested', { runId, workspaceId, cap: 5 });
    await dispatchEvent('verify/fixes.requested', { runId, workspaceId });
  }
}
