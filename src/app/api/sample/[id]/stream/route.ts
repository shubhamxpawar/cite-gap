// SSE stream of sample-report progress — docs/02-App-Flow.md F1 step 5.
import { db } from '@/server/db/client';
import { sampleReports } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type Step = { step: string; detail: string; at: string; status: string };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uuidRe = /^[0-9a-f-]{36}$/i;
  if (!uuidRe.test(id)) return new Response('bad id', { status: 400 });

  const encoder = new TextEncoder();
  let sent = 0;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const push = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const tick = async () => {
        const [row] = await db.select().from(sampleReports).where(eq(sampleReports.id, id)).limit(1);
        if (!row) {
          push('error', { message: 'Report not found' });
          return true;
        }
        const steps = (row.progress as Step[]) ?? [];
        for (; sent < steps.length; sent++) {
          push('step', steps[sent]);
        }
        if (row.status === 'ready' || row.status === 'partial' || row.status === 'failed') {
          push('done', { status: row.status, result: row.result });
          return true;
        }
        return false;
      };

      push('open', { ok: true });
      const started = Date.now();
      while (!closed) {
        const finished = await tick();
        if (finished) break;
        if (Date.now() - started > 150_000) {
          push('error', { message: 'Timed out. Partial results may be available on refresh.' });
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      controller.close();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
