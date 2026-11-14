import { HeaderSkeleton, TableSkeleton } from '@/components/skeletons';

export default function PagesLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <HeaderSkeleton />
      <TableSkeleton cols={5} rows={12} />
      <span className="sr-only">Loading pages…</span>
    </div>
  );
}
