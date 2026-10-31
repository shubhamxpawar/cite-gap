import type { ReactNode } from 'react';
import { CopyButton } from './copy-button';

// Design system components — docs/03-UI-UX-Design.md §2.
// Semantic colors: green=own, orange/red=competitor, grey=third-party. Never reused.

export const ENGINE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  perplexity: 'Perplexity',
  gemini: 'Gemini',
};

export function EngineChip({ engine, disabled, title }: { engine: string; disabled?: boolean; title?: string }) {
  return (
    <span
      title={title ?? (disabled ? `${ENGINE_LABELS[engine] ?? engine} is not configured` : ENGINE_LABELS[engine] ?? engine)}
      className={`inline-flex items-center gap-1 border border-ink px-1.5 py-0.5 text-xs font-medium rounded ${
        disabled ? 'opacity-40 text-muted' : 'bg-surface'
      }`}
    >
      <span aria-hidden className="inline-block size-2 bg-ink" />
      {ENGINE_LABELS[engine] ?? engine}
    </span>
  );
}

const PAGE_TYPE_STYLES: Record<string, string> = {
  pricing: 'bg-accent/40',
  docs: 'bg-info/10',
  comparison: 'bg-competitor-tint',
  alternatives: 'bg-competitor-tint',
  blog: 'bg-third-tint',
  changelog: 'bg-third-tint',
  integrations: 'bg-third-tint',
  homepage: 'bg-own-tint',
  other: 'bg-third-tint',
};

export function PageTypeChip({ type }: { type: string }) {
  return (
    <span className={`mono-url inline-flex items-center rounded border border-ink/40 px-1.5 py-0.5 ${PAGE_TYPE_STYLES[type] ?? 'bg-third-tint'}`}>
      /{type}
    </span>
  );
}

export function OwnerTag({ owner }: { owner: 'own' | 'competitor' | 'third_party' }) {
  const map = {
    own: { label: 'Yours', cls: 'bg-own-tint text-ink', dot: 'dot-own', mark: '✓' },
    competitor: { label: 'Competitor', cls: 'bg-competitor-tint', dot: 'dot-competitor', mark: '▲' },
    third_party: { label: 'Third-party', cls: 'bg-third-tint', dot: 'dot-third', mark: '○' },
  }[owner];
  return (
    <span className={`inline-flex items-center gap-1 rounded border border-ink/40 px-1.5 py-0.5 text-xs font-medium ${map.cls}`}>
      <span aria-hidden className={map.dot}>{map.mark}</span>
      {map.label}
    </span>
  );
}

function middleTruncate(url: string, max = 64) {
  if (url.length <= max) return url;
  const head = url.slice(0, Math.ceil(max * 0.6));
  const tail = url.slice(-Math.floor(max * 0.3));
  return `${head}…${tail}`;
}

export function UrlPill({ url, owner, pageType, showCopy = true }: { url: string; owner?: 'own' | 'competitor' | 'third_party'; pageType?: string; showCopy?: boolean }) {
  let host = url;
  let path = '';
  try {
    const u = new URL(url);
    host = u.host;
    path = u.pathname + u.search;
  } catch { /* keep raw */ }
  const dotCls = owner === 'own' ? 'dot-own' : owner === 'competitor' ? 'dot-competitor' : 'dot-third';
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-middle" title={url}>
      {owner && <span aria-hidden className={`text-xs ${dotCls}`}>{owner === 'own' ? '●' : owner === 'competitor' ? '▲' : '○'}</span>}
      <span className="mono-url truncate">
        <span className="text-muted">{host}</span>
        <span className="font-semibold">{middleTruncate(path || '/', 40)}</span>
      </span>
      {pageType && <PageTypeChip type={pageType} />}
      {showCopy && <CopyButton value={url} />}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${url}`}
        className="text-muted hover:text-ink"
      >
        ↗
      </a>
    </span>
  );
}

export function StatCard({ label, value, delta, hint }: { label: string; value: ReactNode; delta?: { value: string; positive?: boolean }; hint?: string }) {
  return (
    <div className="brutal p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold">{value}</div>
      {delta && (
        <div className={`mt-1 text-xs font-medium ${delta.positive ? 'text-own' : 'text-competitor'}`}>
          {delta.value} vs previous run
        </div>
      )}
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function SourceBadge({ model, date }: { model?: string; date?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-third-tint px-1.5 py-0.5 text-xs text-muted" title="Data comes from the providers' API with web search — it approximates, but does not exactly replicate, the consumer chat apps.">
      ⓘ API-grounded{model ? ` · ${model}` : ''}{date ? ` · ${date}` : ''}
    </span>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-critical text-white',
  high: 'bg-competitor text-white',
  medium: 'bg-accent text-ink',
  low: 'bg-third-tint text-ink',
};

export function SeverityBadge({ severity: sev }: { severity: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold uppercase ${SEVERITY_STYLES[sev] ?? 'bg-third-tint'}`}>
      {sev}
    </span>
  );
}

export function EffortChip({ effort: e }: { effort: string }) {
  return <span className="inline-block rounded border border-ink px-1.5 py-0.5 text-xs font-bold">{e}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="brutal flex flex-col items-center gap-2 p-10 text-center">
      <div className="font-display text-xl font-bold">{title}</div>
      <p className="max-w-md text-muted">{body}</p>
      {action}
    </div>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return <p className="border-l-4 border-muted/40 pl-3 text-xs text-muted">{children}</p>;
}
