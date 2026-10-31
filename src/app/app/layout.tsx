import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { checkRuns, workspaces } from '@/server/db/schema';
import { getCurrentUser } from '@/server/auth/session';
import { AppNav } from '@/components/app-nav';
import { runNowAction, signOutAction } from '@/app/actions';
import { mockEngineEnabled } from '@/server/engines';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user?.workspaceId) redirect('/login');

  const [ws] = await db.select({ name: workspaces.name, plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, user.workspaceId)).limit(1);
  const [latestRun] = await db
    .select({ status: checkRuns.status })
    .from(checkRuns)
    .where(eq(checkRuns.workspaceId, user.workspaceId))
    .orderBy(desc(checkRuns.createdAt))
    .limit(1);
  const badgeRows = (await db.execute(sql`
    select count(*)::int as n from fix_reports fr
    where fr.workspace_id = ${user.workspaceId}::uuid
      and exists (select 1 from fix_items fi where fi.report_id = fr.id and fi.state = 'open')
  `)) as unknown as { n: number }[];

  return (
    <div className="flex min-h-full flex-col">
      {mockEngineEnabled() && (
        <p className="border-b-2 border-ink bg-accent px-4 py-1 text-center text-xs font-medium">
          Demo mode: no provider key configured — engine answers are synthetic (mock engine). Do not treat them as real citations.
        </p>
      )}
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col lg:flex-row">
        <aside className="border-b-2 border-ink bg-bg px-3 py-3 lg:w-[240px] lg:border-b-0 lg:border-r-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link href="/app" className="font-display text-lg font-bold">CiteGap</Link>
            <span className="border border-ink bg-surface px-1.5 py-0.5 text-[10px] font-bold uppercase">{ws?.plan ?? 'free'}</span>
          </div>
          <AppNav fixesBadge={badgeRows[0]?.n ?? 0} />
          <div className="mt-4 border-t border-ink/20 pt-3 text-xs text-muted">
            <p className="truncate font-medium text-ink">{ws?.name}</p>
            <p className="truncate">{user.email}</p>
            <form action={signOutAction} className="mt-2">
              <button type="submit" className="underline hover:text-ink">Sign out</button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink bg-bg px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Workspace</span>
              <span className={`border border-ink px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                latestRun?.status === 'running' ? 'bg-accent' : latestRun?.status === 'partial' ? 'bg-competitor-tint' : latestRun?.status === 'failed' ? 'bg-competitor text-surface' : 'bg-own-tint'
              }`}>
                {latestRun ? `last run ${latestRun.status}` : 'no runs yet'}
              </span>
            </div>
            <form action={runNowAction}>
              <button type="submit" className="brutal brutal-hover min-h-9 bg-accent px-3 py-1 font-display text-sm font-bold">
                Run now ▸
              </button>
            </form>
          </header>
          <main className="w-full max-w-[1200px] flex-1 px-4 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
