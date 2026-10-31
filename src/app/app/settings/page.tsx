import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { domains, workspaces } from '@/server/db/schema';
import { getCurrentUser } from '@/server/auth/session';
import { getUsage } from '@/server/db/queries';
import { updateDomainAction } from '@/app/actions';
import { PLAN_CAPS_USD, PLAN_COMPETITOR_LIMITS, PLAN_PROMPT_LIMITS } from '@/server/jobs/run-check';
import { Disclaimer } from '@/components/ui';

export const dynamic = 'force-dynamic';

const FIX_REPORT_LIMITS: Record<string, number | null> = { free: 0, starter: 5, growth: null };

function Meter({ label, used, limit, note }: { label: string; used: number; limit: number | null; note?: string }) {
  const unlimited = limit === null;
  const pct = unlimited ? 0 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const over = !unlimited && used >= limit;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className={`font-mono text-xs ${over ? 'font-bold text-critical' : 'text-muted'}`}>{used} / {unlimited ? 'unlimited' : limit}</span>
      </div>
      <div className="mt-1 h-3 border-2 border-ink bg-surface" role="img" aria-label={`${label}: ${used} of ${unlimited ? 'unlimited' : limit} used`}>
        <div className={`h-full ${over ? 'bg-critical' : 'bg-own'}`} style={{ width: unlimited ? '100%' : `${pct}%`, opacity: unlimited ? 0.25 : 1 }} />
      </div>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const user = await getCurrentUser();
  const ws = user!.workspaceId!;

  const [[wsRow], [ownDomain], usage] = await Promise.all([
    db.select().from(workspaces).where(eq(workspaces.id, ws)).limit(1),
    db.select().from(domains).where(and(eq(domains.workspaceId, ws), eq(domains.role, 'own'))).limit(1),
    getUsage(ws),
  ]);

  const plan = wsRow?.plan ?? 'free';
  const promptLimit = PLAN_PROMPT_LIMITS[plan];
  const competitorLimit = PLAN_COMPETITOR_LIMITS[plan];
  const fixLimit = FIX_REPORT_LIMITS[plan];
  const cap = Number(usage.budget_cap ?? PLAN_CAPS_USD[plan]);
  const spent = Number(usage.budget_spent ?? usage.run_spend ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted">Workspace, plan usage and check cadence.</p>
      </div>

      {error && <p role="alert" className="border-2 border-critical px-2 py-1 text-sm text-critical">{error}</p>}
      {saved && <p role="status" className="border-2 border-own bg-own-tint px-2 py-1 text-sm">Settings saved.</p>}

      <section className="brutal p-4">
        <h2 className="font-display text-lg font-bold">Workspace</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Name</dt><dd className="font-medium">{wsRow?.name}</dd></div>
          <div><dt className="text-xs text-muted">Signed in as</dt><dd className="font-mono text-xs">{user!.email}</dd></div>
          <div><dt className="text-xs text-muted">Plan</dt><dd><span className="border border-ink bg-surface px-1.5 py-0.5 text-xs font-bold uppercase">{plan}</span></dd></div>
          <div><dt className="text-xs text-muted">Cadence</dt><dd>{wsRow?.runCadenceHours === 168 ? 'Weekly' : `Every ${wsRow?.runCadenceHours}h`}</dd></div>
        </dl>

        <form action={updateDomainAction} className="mt-4 flex max-w-lg flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="hostname" className="text-xs font-medium text-muted">Your domain</label>
            <input id="hostname" name="hostname" defaultValue={ownDomain?.hostname ?? ''} placeholder="yoursite.com" required
              className="brutal-flat mt-1 min-h-11 w-full bg-surface px-3 py-2 font-mono text-sm" />
          </div>
          <button type="submit" className="brutal brutal-hover min-h-11 bg-accent px-4 py-2 font-display font-bold">Save domain</button>
        </form>
        <p className="mt-2 text-xs text-muted">Changing the domain re-tags future citations. Past runs keep the ownership they were captured with.</p>
      </section>

      <section className="brutal p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Plan usage</h2>
          <Link href="/pricing" className="text-xs underline">Compare plans ▸</Link>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Meter label="Active prompts" used={Number(usage.prompts ?? 0)} limit={promptLimit} />
          <Meter label="Competitors" used={Number(usage.competitors ?? 0)} limit={competitorLimit} />
          <Meter label="Fix reports this month" used={Number(usage.fix_reports ?? 0)} limit={fixLimit} note={fixLimit === 0 ? 'Free plan: teaser only.' : fixLimit === null ? 'Unlimited on Growth.' : 'Starter includes 5 per month.'} />
          <Meter label="Provider budget (month)" used={spent} limit={cap} note={`Plan cap $${cap.toFixed(2)}. Spend so far $${spent.toFixed(2)}.`} />
        </div>
        <div className="mt-4 border-t border-ink/20 pt-3">
          <p className="text-sm font-medium">Billing</p>
          <p className="mt-1 text-xs text-muted">
            Billing is not connected in this local demo. Plans are switched directly in the database for the walkthrough.
          </p>
          <Link href="/pricing" className="brutal-flat mt-2 inline-block bg-surface px-3 py-1.5 text-sm font-bold hover:bg-ink hover:text-surface">View plans</Link>
        </div>
      </section>

      <section className="brutal p-4">
        <h2 className="font-display text-lg font-bold">Notifications</h2>
        <p className="text-xs text-muted">Email delivery is not configured in this demo. The preferences are shown so you can see what the workspace will send once a mail provider is connected.</p>
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked disabled className="size-4" /> Run finished (partial or failed runs only)</label>
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked disabled className="size-4" /> New verified win</label>
          <label className="flex items-center gap-2"><input type="checkbox" disabled className="size-4" /> Weekly digest of lost prompts</label>
        </div>
      </section>

      <Disclaimer>Local-first demo: provider keys, billing and email are intentionally not configured. Citation data comes from the mock engine unless a real key is set.</Disclaimer>
    </div>
  );
}
