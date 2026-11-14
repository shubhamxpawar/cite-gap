import { inngest } from './inngest';
import { syncOwnPages } from '@/server/pipeline/sync-own-pages';

export const discoverOwnPagesJob = inngest.createFunction(
  { id: 'discover-own-pages', retries: 2 },
  { event: 'pages/discover.requested' },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string };
    const result = await step.run('discover-own-pages', () => syncOwnPages(workspaceId));
    return result;
  },
);
