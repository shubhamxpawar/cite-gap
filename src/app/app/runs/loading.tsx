import { HeaderSkeleton, ListSkeleton } from '@/components/skeletons';

export default function RunsLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <HeaderSkeleton />
      <ListSkeleton rows={8} />
      <span className="sr-only">Loading runs…</span>
    </div>
  );
}
