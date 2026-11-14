import { HeaderSkeleton, ListSkeleton } from '@/components/skeletons';

export default function CompetitorsLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <HeaderSkeleton />
      <ListSkeleton rows={4} />
      <span className="sr-only">Loading competitors…</span>
    </div>
  );
}
