import { HeaderSkeleton, StatGridSkeleton } from '@/components/skeletons';

export default function AppLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <HeaderSkeleton />
      <StatGridSkeleton />
      <div className="h-72 animate-pulse border-2 border-ink/15 bg-surface" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
