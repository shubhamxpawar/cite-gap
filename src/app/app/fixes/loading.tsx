import { HeaderSkeleton, ListSkeleton } from '@/components/skeletons';

export default function FixesLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <HeaderSkeleton />
      <ListSkeleton rows={6} />
      <span className="sr-only">Loading fixes…</span>
    </div>
  );
}
