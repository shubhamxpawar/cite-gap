// Event dispatch. With Inngest (cloud keys, or the local dev server via
// INNGEST_DEV=1) events go to Inngest. Without it — the local-first default —
// the same job handlers run in-process so the whole product works with
// `npm run dev` + Postgres only (docs/decisions.md D11).
import crypto from 'node:crypto';
import { inngest } from './inngest';
import type { InngestFunction } from 'inngest';

type JobName =
  | 'sample/run.requested'
  | 'check/run.requested'
  | 'run-prompt-engine/requested'
  | 'fix-report/build.requested'
  | 'verify/fixes.requested';

export type DispatchableEvent = { name: JobName; data: Record<string, unknown> };

function inngestConfigured(): boolean {
  // INNGEST_DEV=1 makes the SDK target the local dev server (localhost:8288).
  return Boolean(process.env.INNGEST_EVENT_KEY) || process.env.INNGEST_DEV === '1' || process.env.INNGEST_DEV_SERVER === '1';
}

let jobsPromise: Promise<Record<JobName, InngestFunction.Any>> | null = null;
function jobs() {
  jobsPromise ??= (async () => {
    const [sample, runCheck, fix, verify] = await Promise.all([
      import('./sample-report'),
      import('./run-check'),
      import('./build-fix-report'),
      import('./verify-fixes'),
    ]);
    return {
      'sample/run.requested': sample.sampleReportJob as unknown as InngestFunction.Any,
      'check/run.requested': runCheck.runCheckJob as unknown as InngestFunction.Any,
      'run-prompt-engine/requested': runCheck.runPromptEngineJob as unknown as InngestFunction.Any,
      'fix-report/build.requested': fix.buildFixReportJob as unknown as InngestFunction.Any,
      'verify/fixes.requested': verify.verifyFixesJob as unknown as InngestFunction.Any,
    };
  })();
  return jobsPromise;
}

// Local fan-out limit: at most 3 provider calls at once per process (mirrors workspace concurrency).
const MAX_LOCAL_CONCURRENCY = 3;
let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_LOCAL_CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

const inFlight = new Set<Promise<unknown>>();

async function executeLocal(name: JobName, data: Record<string, unknown>): Promise<void> {
  const job = (await jobs())[name];
  if (!job) throw new Error(`no local handler for ${name}`);
  const step = {
    run: async <T>(_id: string, fn: () => Promise<T> | T): Promise<T> => fn(),
    sendEvent: async (_id: string, events: DispatchableEvent | DispatchableEvent[]) => {
      const list = Array.isArray(events) ? events : [events];
      await Promise.all(list.map((e) => dispatchEvent(e.name, e.data)));
      return list;
    },
    sleep: async (_id: string, ms: number) => new Promise((r) => setTimeout(r, ms)),
    sleepUntil: async (_id: string, date: Date | string) => {
      const ms = new Date(date).getTime() - Date.now();
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    },
  };
  const run = () =>
    (job as unknown as { fn: (ctx: Record<string, unknown>) => Promise<unknown> }).fn({
      event: { name, data },
      events: [{ name, data }],
      step,
      runId: crypto.randomUUID(),
      attempt: 0,
      logger: console,
    });
  const isProviderCall = name === 'run-prompt-engine/requested';
  await (isProviderCall ? withSlot(run) : run());
}

function runLocally(name: JobName, data: Record<string, unknown>): void {
  const p = executeLocal(name, data).catch((err) => {
    console.error(`[local-job] ${name} failed`, err);
  });
  inFlight.add(p);
  p.finally(() => inFlight.delete(p));
}

/** Fire-and-forget dispatch. Returns immediately in both modes. */
export async function dispatchEvent(name: JobName, data: Record<string, unknown>): Promise<void> {
  if (inngestConfigured()) {
    try {
      await inngest.send({ name, data });
      return;
    } catch (err) {
      // Dev server not running / cloud unreachable: never drop the run, just
      // execute the same handler in-process so the product keeps working.
      console.error(`[inngest] send failed for ${name}; falling back to local execution`, err);
    }
  }
  runLocally(name, data);
}

/** Awaits in-flight local jobs (used by scripts/seed + tests). */
export async function drainLocalJobs(): Promise<void> {
  while (inFlight.size) await Promise.all([...inFlight]);
}
