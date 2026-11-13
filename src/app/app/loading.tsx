export default function AppLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse border-2 border-ink/15 bg-surface" />
        <div className="h-4 w-72 animate-pulse border-2 border-ink/10 bg-surface" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse border-2 border-ink/15 bg-surface" />
        ))}
      </div>
      <div className="h-72 animate-pulse border-2 border-ink/15 bg-surface" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
