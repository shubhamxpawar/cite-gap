'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { checkRuns, domains, fixItems, prompts, sampleReports, workspaces } from '@/server/db/schema';
import { getCurrentUser, signInOrCreate, destroySession } from '@/server/auth/session';
import { createRun, PLAN_PROMPT_LIMITS, PLAN_COMPETITOR_LIMITS } from '@/server/jobs/run-check';
import { getEnabledEngines } from '@/server/engines';
import { onboardingPrompts } from '@/server/pipeline/prompts';
import { track } from '@/server/analytics';

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function hostnameOf(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
  return /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*\.[a-z]{2,24}$/.test(raw) ? raw : null;
}

async function requireWorkspace() {
  const user = await getCurrentUser();
  if (!user?.workspaceId) redirect('/login');
  return { userId: user.userId, workspaceId: user.workspaceId };
}

async function planOf(workspaceId: string): Promise<'free' | 'starter' | 'growth'> {
  const [ws] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return ws?.plan ?? 'free';
}

export async function signInAction(formData: FormData) {
  const email = str(formData, 'email').toLowerCase();
  const sampleId = str(formData, 'sampleId');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(`/login?error=Enter+a+valid+email${sampleId ? `&sampleId=${sampleId}` : ''}`);
  const { workspaceId } = await signInOrCreate(email);
  if (sampleId) track('sample_to_signup', { sampleId, workspaceId });
  const hasDomain = await db.select({ id: domains.id }).from(domains).where(eq(domains.workspaceId, workspaceId)).limit(1);
  redirect(hasDomain.length ? '/app' : `/onboarding${sampleId ? `?sampleId=${sampleId}` : ''}`);
}

export async function demoSignInAction() {
  const { workspaceId } = await signInOrCreate('demo@citegap.dev');
  const hasDomain = await db.select({ id: domains.id }).from(domains).where(eq(domains.workspaceId, workspaceId)).limit(1);
  redirect(hasDomain.length ? '/app' : '/onboarding');
}

export async function signOutAction() {
  await destroySession();
  redirect('/');
}

export async function saveDomainAction(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const hostname = hostnameOf(str(formData, 'hostname'));
  const sampleId = str(formData, 'sampleId');
  if (!hostname) redirect(`/onboarding?step=1&error=Enter+a+valid+domain${sampleId ? `&sampleId=${sampleId}` : ''}`);

  const existing = await db.select({ id: domains.id }).from(domains).where(and(eq(domains.workspaceId, workspaceId), eq(domains.role, 'own'))).limit(1);
  if (existing.length) {
    await db.update(domains).set({ hostname, label: hostname }).where(eq(domains.id, existing[0].id));
  } else {
    await db.insert(domains).values({ workspaceId, hostname, role: 'own', label: hostname });
  }
  revalidatePath('/onboarding');
  redirect(`/onboarding?step=2${sampleId ? `&sampleId=${sampleId}` : ''}`);
}

export async function saveCompetitorsAction(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const sampleId = str(formData, 'sampleId');
  const plan = await planOf(workspaceId);
  const limit = PLAN_COMPETITOR_LIMITS[plan];
  const [own] = await db.select({ hostname: domains.hostname }).from(domains).where(and(eq(domains.workspaceId, workspaceId), eq(domains.role, 'own'))).limit(1);

  const hosts = str(formData, 'competitors')
    .split(/[\s,]+/)
    .map((h) => hostnameOf(h))
    .filter((h): h is string => Boolean(h) && h !== own?.hostname)
    .slice(0, limit);

  await db.delete(domains).where(and(eq(domains.workspaceId, workspaceId), eq(domains.role, 'competitor')));
  if (hosts.length) {
    await db.insert(domains).values(hosts.map((hostname) => ({ workspaceId, hostname, role: 'competitor' as const, label: hostname }))).onConflictDoNothing();
  }
  revalidatePath('/onboarding');
  redirect(`/onboarding?step=3${sampleId ? `&sampleId=${sampleId}` : ''}`);
}

export async function savePromptsAction(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const plan = await planOf(workspaceId);
  const limit = PLAN_PROMPT_LIMITS[plan];
  const selected = formData.getAll('prompt').map(String);
  const pasted = str(formData, 'paste').split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
  const texts = [...new Set([...selected, ...pasted])].filter((t) => t.length >= 8 && t.length <= 400).slice(0, limit);

  await db.delete(prompts).where(eq(prompts.workspaceId, workspaceId));
  if (texts.length) {
    await db.insert(prompts).values(texts.map((text) => ({
      workspaceId,
      text,
      intent: guessIntent(text),
      source: 'generated' as const,
    })));
  }
  revalidatePath('/onboarding');
  redirect('/onboarding?step=3&saved=1');
}

export async function finishOnboardingAction() {
  const { workspaceId } = await requireWorkspace();
  const promptRows = await db.select({ id: prompts.id }).from(prompts).where(and(eq(prompts.workspaceId, workspaceId), eq(prompts.active, true)));
  if (promptRows.length === 0) redirect('/onboarding?step=3&error=Pick+at+least+one+question');

  const [own] = await db.select({ hostname: domains.hostname }).from(domains).where(and(eq(domains.workspaceId, workspaceId), eq(domains.role, 'own'))).limit(1);
  const engines = getEnabledEngines(own ? [own.hostname] : [], [])
    .filter((e) => e.id === 'chatgpt' || e.id === 'perplexity')
    .map((e) => e.id);
  await createRun(workspaceId, 'onboarding', engines, 1);
  track('onboarding_completed', { workspaceId, prompts: promptRows.length, engines });
  await db.update(workspaces).set({ nextRunAt: sql`now() + interval '7 days'` }).where(eq(workspaces.id, workspaceId));
  revalidatePath('/app');
  redirect('/app?firstRun=1');
}

export async function runNowAction() {
  const { workspaceId } = await requireWorkspace();
  const plan = await planOf(workspaceId);
  const maxEngines = plan === 'growth' ? 4 : plan === 'starter' ? 3 : 2;
  const [own] = await db.select({ hostname: domains.hostname }).from(domains).where(and(eq(domains.workspaceId, workspaceId), eq(domains.role, 'own'))).limit(1);
  const engines = getEnabledEngines(own ? [own.hostname] : [], []).slice(0, maxEngines).map((e) => e.id);
  if (engines.length === 0) redirect('/app?error=No+engine+configured');
  await createRun(workspaceId, 'manual', engines, 1);
  await db.update(workspaces).set({ nextRunAt: sql`now() + interval '7 days'` }).where(eq(workspaces.id, workspaceId));
  revalidatePath('/app');
  redirect('/app?running=1');
}

export async function cancelRunAction(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const runId = str(formData, 'runId');
  await db
    .update(checkRuns)
    .set({ status: 'canceled', finishedAt: new Date() })
    .where(and(eq(checkRuns.id, runId), eq(checkRuns.workspaceId, workspaceId), eq(checkRuns.status, 'running')));
  revalidatePath('/app');
  revalidatePath('/app/runs');
}

export async function markFixItemAction(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const itemId = str(formData, 'itemId');
  const done = str(formData, 'done') === '1';
  await db
    .update(fixItems)
    .set({ state: done ? 'done' : 'open', markedDoneAt: done ? new Date() : null, verifiedAt: null })
    .where(and(eq(fixItems.id, itemId), eq(fixItems.workspaceId, workspaceId)));
  track('fix_item_done', { workspaceId, itemId, done });
  revalidatePath(`/app/fixes/${str(formData, 'reportId')}`);
  revalidatePath('/app/fixes');
  revalidatePath('/app');
}

export async function recheckReportAction() {
  const { workspaceId } = await requireWorkspace();
  const [own] = await db.select({ hostname: domains.hostname }).from(domains).where(and(eq(domains.workspaceId, workspaceId), eq(domains.role, 'own'))).limit(1);
  const engines = getEnabledEngines(own ? [own.hostname] : [], []).slice(0, 2).map((e) => e.id);
  if (engines.length) await createRun(workspaceId, 'manual', engines, 1);
  revalidatePath('/app/fixes');
  redirect(`/app/runs?recheck=1`);
}

export async function loadSamplePrefill(sampleId: string) {
  const [row] = await db.select({ result: sampleReports.result, hostname: sampleReports.hostname }).from(sampleReports).where(eq(sampleReports.id, sampleId)).limit(1);
  if (!row?.result) return null;
  const result = row.result as {
    category?: string;
    prompts?: { text: string; intent: string }[];
    topCompetitorUrls?: { host: string }[];
  };
  return {
    hostname: row.hostname,
    category: result.category ?? 'software',
    prompts: result.prompts ?? [],
    competitors: [...new Set((result.topCompetitorUrls ?? []).map((u) => u.host))].slice(0, 2),
  };
}

export async function suggestedPrompts(hostname: string, category: string) {
  const brand = hostname.split('.')[0];
  return onboardingPrompts(brand, category);
}

export async function addPromptAction(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const plan = await planOf(workspaceId);
  const limit = PLAN_PROMPT_LIMITS[plan];
  const text = str(formData, 'text');
  const intent = str(formData, 'intent') || guessIntent(text);
  const rows = await db.select({ id: prompts.id }).from(prompts).where(eq(prompts.workspaceId, workspaceId));
  if (rows.length >= limit || text.length < 8 || text.length > 400) {
    redirect(`/app/prompts?error=${rows.length >= limit ? `Plan+limit+reached+(${limit}+prompts)` : 'Prompt+must+be+8-400+characters'}`);
  }
  await db.insert(prompts).values({ workspaceId, text, intent: intent as 'pricing', source: 'manual' });
  revalidatePath('/app/prompts');
  redirect('/app/prompts');
}

export async function togglePromptAction(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const promptId = str(formData, 'promptId');
  await db
    .update(prompts)
    .set({ active: sql`not ${prompts.active}` })
    .where(and(eq(prompts.id, promptId), eq(prompts.workspaceId, workspaceId)));
  revalidatePath('/app/prompts');
}

export async function deletePromptAction(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const promptId = str(formData, 'promptId');
  await db.delete(prompts).where(and(eq(prompts.id, promptId), eq(prompts.workspaceId, workspaceId)));
  revalidatePath('/app/prompts');
}

export async function updateDomainAction(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const hostname = hostnameOf(str(formData, 'hostname'));
  if (!hostname) redirect('/app/settings?error=Invalid+domain');
  const existing = await db.select({ id: domains.id }).from(domains).where(and(eq(domains.workspaceId, workspaceId), eq(domains.role, 'own'))).limit(1);
  if (existing.length) await db.update(domains).set({ hostname }).where(eq(domains.id, existing[0].id));
  else await db.insert(domains).values({ workspaceId, hostname, role: 'own' });
  revalidatePath('/app/settings');
  redirect('/app/settings?saved=1');
}

export async function addCompetitorAction(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const plan = await planOf(workspaceId);
  const limit = PLAN_COMPETITOR_LIMITS[plan];
  const hostname = hostnameOf(str(formData, 'hostname'));
  const rows = await db.select({ id: domains.id }).from(domains).where(and(eq(domains.workspaceId, workspaceId), eq(domains.role, 'competitor')));
  if (!hostname || rows.length >= limit) redirect(`/app/competitors?error=${!hostname ? 'Invalid+domain' : `Competitor+limit+reached+(${limit})`}`);
  await db.insert(domains).values({ workspaceId, hostname, role: 'competitor', label: hostname }).onConflictDoNothing();
  revalidatePath('/app/competitors');
  redirect('/app/competitors?saved=1');
}

export async function removeCompetitorAction(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const id = str(formData, 'domainId');
  await db.delete(domains).where(and(eq(domains.id, id), eq(domains.workspaceId, workspaceId), eq(domains.role, 'competitor')));
  revalidatePath('/app/competitors');
}

function guessIntent(text: string): 'pricing' | 'docs' | 'comparison' | 'alternatives' | 'howto' | 'brand' {
  const t = text.toLowerCase();
  if (/\bvs\b|\bversus\b|\bcompare\b|\bcomparison\b/.test(t)) return 'comparison';
  if (/\balternatives?\b|\bcompetitors?\b/.test(t)) return 'alternatives';
  if (/\bprice|pricing|cost|cheap|budget|per month\b/.test(t)) return 'pricing';
  if (/\bhow\b|\bset ?up\b|\bimport\b|\bapi\b|\bdocs?\b|\bguide\b|\btutorial\b/.test(t)) return 'howto';
  if (/\breview|\bworth it|\bwhat is\b/.test(t)) return 'brand';
  return 'docs';
}
