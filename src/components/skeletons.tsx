// Shared neo-brutalist skeletons for route-level loading states.
export function HeaderSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <div className="h-8 w-44 animate-pulse border-2 border-ink/15 bg-surface" />
      <div className="h-4 w-64 animate-pulse border-2 border-ink/10 bg-surface" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-24 animate-pulse border-2 border-ink/15 bg-surface" />
      ))}
    </div>
  );
}

export function TableSkeleton({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <div className="overflow-hidden border-2 border-ink/15" aria-hidden>
      <div className="flex gap-3 border-b-2 border-ink/15 bg-surface p-2">
        {Array.from({ length: cols }, (_, i) => (
          <div key={i} className="h-4 flex-1 animate-pulse bg-ink/10" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3 border-b border-ink/10 p-3 last:border-b-0">
          {Array.from({ length: cols }, (_, j) => (
            <div key={j} className="h-4 flex-1 animate-pulse bg-ink/10" style={{ width: `${60 + ((i * 37 + j * 23) % 35)}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 animate-pulse border-2 border-ink/15 bg-surface" />
      ))}
    </div>
  );
}
