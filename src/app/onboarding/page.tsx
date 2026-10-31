import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { domains, prompts, workspaces } from '@/server/db/schema';
import { getCurrentUser } from '@/server/auth/session';
import { loadSamplePrefill, saveCompetitorsAction, saveDomainAction, savePromptsAction, finishOnboardingAction } from '@/app/actions';
import { PromptPicker } from '@/components/prompt-picker';
import { PLAN_COMPETITOR_LIMITS, PLAN_PROMPT_LIMITS } from '@/server/jobs/run-check';
import { onboardingPrompts } from '@/server/pipeline/prompts';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; sampleId?: string; error?: string; saved?: string }>;
}) {
  const { step: rawStep, sampleId, error, saved } = await searchParams;
  const user = await getCurrentUser();
  if (!user?.workspaceId) redirect(`/login${sampleId ? `?sampleId=${sampleId}` : ''}`);

  const [ws] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, user.workspaceId)).limit(1);
  const plan = ws?.plan ?? 'free';
  const promptLimit = PLAN_PROMPT_LIMITS[plan];
  const competitorLimit = PLAN_COMPETITOR_LIMITS[plan];

  const [own] = await db.select({ hostname: domains.hostname }).from(domains).where(and(eq(domains.workspaceId, user.workspaceId), eq(domains.role, 'own'))).limit(1);
  const competitorRows = await db.select({ hostname: domains.hostname }).from(domains).where(and(eq(domains.workspaceId, user.workspaceId), eq(domains.role, 'competitor')));
  const promptRows = await db.select({ text: prompts.text }).from(prompts).where(eq(prompts.workspaceId, user.workspaceId));

  const prefill = sampleId ? await loadSamplePrefill(sampleId) : null;
  const hostname = own?.hostname ?? prefill?.hostname ?? '';
  const category = prefill?.category ?? 'software';
  const brand = hostname.split('.')[0] || 'your product';
  const suggested = onboardingPrompts(brand, category);
  const selected = promptRows.length ? promptRows.map((p) => p.text) : suggested.slice(0, Math.min(8, promptLimit)).map((p) => p.text);
  const competitorDefault = competitorRows.length ? competitorRows.map((c) => c.hostname).join('\n') : (prefill?.competitors ?? []).join('\n');

  const step = Math.min(3, Math.max(1, Number(rawStep ?? (hostname ? 2 : 1))));
  const steps = [
    { n: 1, label: 'Domain' },
    { n: 2, label: 'Competitors' },
    { n: 3, label: 'Questions' },
  ];

  return (
    <main className="mx-auto w-full max-w-[560px] px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="font-display text-lg font-bold">CiteGap</Link>
        <span className="font-mono text-xs text-muted">Setup · plan {plan}</span>
      </div>

      <ol className="mb-6 flex items-center gap-2" aria-label="Onboarding steps">
        {steps.map((s, i) => (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            <span className={`flex size-7 items-center justify-center border-2 border-ink font-mono text-xs font-bold ${step === s.n ? 'bg-accent' : step > s.n ? 'bg-own text-surface' : 'bg-surface'}`}>
              {step > s.n ? '✓' : s.n}
            </span>
            <span className={`text-xs font-medium ${step === s.n ? '' : 'text-muted'}`}>{s.label}</span>
            {i < steps.length - 1 && <span aria-hidden className="h-0.5 flex-1 bg-ink/30" />}
          </li>
        ))}
      </ol>

      {error && <p role="alert" className="mb-3 border-2 border-critical px-2 py-1 text-sm text-critical">{error}</p>}
      {saved && <p className="mb-3 border-2 border-ink bg-own-tint px-2 py-1 text-sm">Questions saved.</p>}

      {step === 1 && (
        <section className="brutal p-5">
          <h1 className="font-display text-xl font-bold">Your domain</h1>
          <p className="mt-1 text-sm text-muted">We discover your pricing, docs and comparison pages and track which ones AI assistants cite.</p>
          <form action={saveDomainAction} className="mt-4 space-y-3">
            {sampleId && <input type="hidden" name="sampleId" value={sampleId} />}
            <label className="block text-sm font-medium" htmlFor="hostname">Domain</label>
            <input id="hostname" name="hostname" required defaultValue={hostname} placeholder="acme.com"
              className="brutal-flat min-h-11 w-full bg-surface px-3 py-2 font-mono text-sm" />
            <p className="text-xs text-muted">Hostname only. Subdomains like docs.acme.com count as yours.</p>
            <button type="submit" className="brutal brutal-hover min-h-11 w-full bg-accent px-4 py-2 font-display font-bold">Continue ▸</button>
          </form>
        </section>
      )}

      {step === 2 && (
        <section className="brutal p-5">
          <h1 className="font-display text-xl font-bold">Competitors</h1>
          <p className="mt-1 text-sm text-muted">Up to {competitorLimit} on the {plan} plan. One hostname per line. You can change these later.</p>
          <form action={saveCompetitorsAction} className="mt-4 space-y-3">
            {sampleId && <input type="hidden" name="sampleId" value={sampleId} />}
            <label className="block text-sm font-medium" htmlFor="competitors">Competitor domains</label>
            <textarea id="competitors" name="competitors" rows={4} defaultValue={competitorDefault} placeholder={'rival.com\nother.com'}
              className="brutal-flat w-full bg-surface px-3 py-2 font-mono text-sm" />
            <div className="flex gap-2">
              <Link href="/onboarding?step=1" className="brutal-flat min-h-11 flex-1 bg-surface px-4 py-2 text-center font-display font-bold">← Back</Link>
              <button type="submit" className="brutal brutal-hover min-h-11 flex-1 bg-accent px-4 py-2 font-display font-bold">Continue ▸</button>
            </div>
          </form>
        </section>
      )}

      {step === 3 && (
        <section className="brutal p-5">
          <h1 className="font-display text-xl font-bold">Questions your buyers ask</h1>
          <p className="mt-1 text-sm text-muted">These are sent verbatim to every engine. Pick up to {promptLimit} on the {plan} plan.</p>
          <form className="mt-4 space-y-4">
            <PromptPicker prompts={suggested} limit={promptLimit} initial={selected} />
            <div>
              <label className="block text-sm font-medium" htmlFor="paste">Paste more (one per line)</label>
              <textarea id="paste" name="paste" rows={3} placeholder="how much does acme cost for a team of 5?"
                className="brutal-flat mt-1 w-full bg-surface px-3 py-2 font-mono text-xs" />
            </div>
            <div className="flex gap-2">
              <Link href="/onboarding?step=2" className="brutal-flat min-h-11 flex-1 bg-surface px-4 py-2 text-center font-display font-bold">← Back</Link>
              <button type="submit" formAction={savePromptsAction} className="brutal-flat min-h-11 bg-surface px-4 py-2 font-display font-bold">Save questions</button>
              <button type="submit" formAction={finishOnboardingAction} className="brutal brutal-hover min-h-11 flex-1 bg-accent px-4 py-2 font-display font-bold">Finish &amp; run first check ▸</button>
            </div>
          </form>
        </section>
      )}

      <p className="mt-4 text-center text-xs text-muted">
        Results are API-grounded samples. Findings are differences vs the cited page, not guarantees.
      </p>
    </main>
  );
}
