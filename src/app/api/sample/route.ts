import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { sampleReports } from '@/server/db/schema';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { dispatchEvent } from '@/server/jobs/dispatch';
import { track } from '@/server/analytics';

export const dynamic = 'force-dynamic';

const HOST_RE = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*\.[a-z]{2,24}$/;

// Accepts "https://www.acme.com/pricing" → "acme.com"
function toHostname(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (!raw) return null;
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.split('/')[0];
  raw = raw.replace(/^www\./, '');
  if (raw.includes(':') || raw === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(raw)) return null;
  return HOST_RE.test(raw) ? raw : null;
}

function ipHash(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? 'local';
  return crypto.createHash('sha256').update(`${fwd}:${process.env.SESSION_SECRET ?? 'dev'}`).digest('hex').slice(0, 32);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const hostname = toHostname(String(body.hostname ?? ''));
  if (!hostname) {
    return NextResponse.json({ error: 'Enter a valid domain, e.g. acme.com' }, { status: 400 });
  }

  // rate limit: 3/day per IP hash (skip for local dev loopback)
  const hash = ipHash(req);
  if (process.env.NODE_ENV === 'production') {
    const rows = (await db.execute(sql`
      select count(*)::int as n from sample_reports
      where ip_hash = ${hash} and created_at > now() - interval '1 day'
    `)) as unknown as { n: number }[];
    const n = rows[0]?.n ?? 0;
    if (n >= 3) {
      return NextResponse.json({ error: 'Come back tomorrow — or sign up for a free workspace.' }, { status: 429 });
    }
  }

  // hostname cache: report younger than 7 days is reused
  const cached = await db
    .select({ id: sampleReports.id })
    .from(sampleReports)
    .where(and(eq(sampleReports.hostname, hostname), gt(sampleReports.createdAt, sql`now() - interval '7 days'`)))
    .orderBy(desc(sampleReports.createdAt))
    .limit(1);
  if (cached.length) {
    track('sample_completed', { hostname, cached: true });
    return NextResponse.json({ id: cached[0].id, cached: true });
  }

  const [row] = await db.insert(sampleReports).values({ hostname, ipHash: hash }).returning({ id: sampleReports.id });
  track('sample_started', { hostname, sampleId: row.id });
  await dispatchEvent('sample/run.requested', { sampleId: row.id, hostname });
  return NextResponse.json({ id: row.id, cached: false });
}
