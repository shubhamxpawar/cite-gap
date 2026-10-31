import { NextResponse } from 'next/server';
import { sql } from '@/server/db/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DB_TIMEOUT_MS = 3000;

/**
 * Unauthenticated liveness + readiness probe used by the Synteq health gate
 * (deploy/synteq.md). Returns 200 only when the app can reach Postgres, so a
 * release with a bad DATABASE_URL never takes traffic.
 */
export async function GET() {
  const startedAt = Date.now();
  let db: 'ok' | 'down' = 'down';
  let detail: string | undefined;

  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`db check timed out after ${DB_TIMEOUT_MS}ms`)), DB_TIMEOUT_MS);
    });
    try {
      await Promise.race([sql`select 1`, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    db = 'ok';
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(
    {
      status: db === 'ok' ? 'ok' : 'degraded',
      service: 'cite-gap',
      db,
      mockEngine: process.env.ENABLE_MOCK_ENGINE === '1',
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - startedAt,
      ...(detail ? { detail } : {}),
    },
    { status: db === 'ok' ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
