import { HeaderSkeleton, TableSkeleton } from '@/components/skeletons';

export default function PromptsLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <HeaderSkeleton />
      <TableSkeleton cols={7} rows={8} />
      <span className="sr-only">Loading prompts…</span>
    </div>
  );
}
