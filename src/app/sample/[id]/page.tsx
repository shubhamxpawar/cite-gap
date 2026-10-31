import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { sampleReports } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { SampleReport } from '@/components/sample-report';
import { SiteFooter, SiteHeader } from '@/components/site-header';

export const dynamic = 'force-dynamic';

export default async function SamplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row] = await db.select({ hostname: sampleReports.hostname }).from(sampleReports).where(eq(sampleReports.id, id)).limit(1);
  if (!row) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1000px] flex-1 px-4 py-8">
        <SampleReport id={id} hostname={row.hostname} />
      </main>
      <SiteFooter />
    </div>
  );
}
