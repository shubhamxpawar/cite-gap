import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-b-2 border-ink bg-bg">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <span aria-hidden className="inline-block size-3 bg-own" />
          CiteGap
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/pricing" className="hover:underline">Pricing</Link>
          <Link href="/login" className="hover:underline">Log in</Link>
          <Link href="/signup" className="brutal-flat bg-accent px-3 py-1.5 font-display font-bold hover:bg-ink hover:text-surface">
            Start free
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t-2 border-ink bg-bg">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>CiteGap — page-level AI citation diagnosis. API-grounded samples, not consumer-app replicas.</p>
        <p>Findings are evidence-based differences, not guarantees of citation.</p>
      </div>
    </footer>
  );
}
