'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/app', label: 'Dashboard' },
  { href: '/app/prompts', label: 'Prompts' },
  { href: '/app/pages', label: 'Pages' },
  { href: '/app/fixes', label: 'Fixes' },
  { href: '/app/competitors', label: 'Competitors' },
  { href: '/app/runs', label: 'Runs' },
  { href: '/app/settings', label: 'Settings' },
];

export function AppNav({ fixesBadge }: { fixesBadge: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
      {LINKS.map((l) => {
        const active = l.href === '/app' ? pathname === '/app' : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-10 items-center justify-between gap-2 border-2 px-2.5 py-1.5 text-sm font-medium ${
              active ? 'border-ink bg-accent' : 'border-transparent hover:border-ink/30 hover:bg-surface'
            }`}
          >
            <span>{l.label}</span>
            {l.href === '/app/fixes' && fixesBadge > 0 && (
              <span className="border border-ink bg-competitor px-1 font-mono text-[10px] font-bold text-surface">{fixesBadge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
