// Sync the workspace's own site into the pages table (discovery → classify → upsert),
// so reports can track pricing/docs/comparison pages even if no AI engine ever cites them.
import { eq, and } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { domains, pages } from '@/server/db/schema';
import { classifyPage } from './classify-page';
import { discoverPages } from './discover-pages';
import { normalizeUrl } from './normalize-url';

const MAX_STORE = 100;

export async function syncOwnPages(workspaceId: string): Promise<{ synced: number; found: number; source: string }> {
  const [own] = await db.select({ id: domains.id, hostname: domains.hostname }).from(domains).where(and(eq(domains.workspaceId, workspaceId), eq(domains.role, 'own'))).limit(1);
  if (!own) return { synced: 0, found: 0, source: 'none' };

  const result = await discoverPages(own.hostname);
  let synced = 0;
  for (const page of result.pages.slice(0, MAX_STORE)) {
    const url = normalizeUrl(page.url);
    if (!url) continue;
    const pageType = classifyPage(url);
    await db
      .insert(pages)
      .values({
        workspaceId,
        urlNormalized: url,
        hostname: new URL(url).host,
        pageType,
        owner: 'own',
        discoveredVia: result.source === 'none' ? 'manual' : result.source,
        domainId: own.id,
      })
      .onConflictDoUpdate({
        target: [pages.workspaceId, pages.urlNormalized],
        set: { pageType, owner: 'own', domainId: own.id },
      });
    synced += 1;
  }
  return { synced, found: result.pages.length, source: result.source };
}
