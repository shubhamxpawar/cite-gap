import { HeaderSkeleton } from '@/components/skeletons';

export default function SettingsLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <HeaderSkeleton />
      <div className="h-48 animate-pulse border-2 border-ink/15 bg-surface" aria-hidden />
      <div className="h-48 animate-pulse border-2 border-ink/15 bg-surface" aria-hidden />
      <span className="sr-only">Loading settings…</span>
    </div>
  );
}
