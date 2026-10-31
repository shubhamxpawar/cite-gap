// Verification loop — docs/02-App-Flow.md F7 + docs/04-Backend-Schema.md §6 verification rule.
// A report with any done item is checked against the newest response for the same (prompt, engine):
// own page now cited → verified_win, otherwise not_yet.
import { inngest } from './inngest';
import { db } from '@/server/db/client';
import { fixItems, fixReports } from '@/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { track } from '@/server/analytics';

export const verifyFixesJob = inngest.createFunction(
  { id: 'verify-fixes', retries: 1 },
  { event: 'verify/fixes.requested' },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { runId: string; workspaceId: string };

    const candidates = await step.run('load-done-reports', async () => {
      const r = await db.execute(sql`
        select fr.id::text as report_id, fr.prompt_id::text, fr.engine::text, fr.own_page_id::text
        from fix_reports fr
        where fr.workspace_id = ${workspaceId}::uuid
          and exists (select 1 from fix_items fi where fi.report_id = fr.id and fi.state in ('done','not_yet'))
      `);
      return r as unknown as { report_id: string; prompt_id: string; engine: string; own_page_id: string | null }[];
    });

    let wins = 0;
    for (const report of candidates) {
      const outcome = await step.run(`verify:${report.report_id}`, async () => {
        if (!report.own_page_id) return { cited: false };
        const r = await db.execute(sql`
          select exists (
            select 1
            from responses r
            join citations c on c.response_id = r.id
            where r.prompt_id = ${report.prompt_id}::uuid
              and r.engine::text = ${report.engine}
              and r.status = 'ok'
              and c.page_id = ${report.own_page_id}::uuid
              and c.kind = 'cited'
              and r.created_at >= (select created_at from fix_reports where id = ${report.report_id}::uuid)
          ) as cited
        `);
        return { cited: Boolean((r as unknown as { cited: boolean }[])[0]?.cited) };
      });

      if (outcome.cited) {
        wins += 1;
        track('fix_verified_win', { workspaceId, reportId: report.report_id });
        await db
          .update(fixItems)
          .set({ state: 'verified_win', verifiedAt: new Date() })
          .where(and(eq(fixItems.reportId, report.report_id), eq(fixItems.state, 'done')));
        await db
          .update(fixReports)
          .set({ status: 'ready' })
          .where(eq(fixReports.id, report.report_id));
      } else {
        await db
          .update(fixItems)
          .set({ state: 'not_yet' })
          .where(and(eq(fixItems.reportId, report.report_id), eq(fixItems.state, 'done')));
      }
    }
    return { checked: candidates.length, wins };
  },
);
