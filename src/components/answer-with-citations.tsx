import { PageTypeChip, UrlPill } from '@/components/ui';

export type Citation = {
  url: string;
  title: string | null;
  pageType: string;
  owner: string;
  kind: string;
  position: number;
  citedText: string | null;
};

const OWNER_CLASS: Record<string, string> = {
  own: 'bg-own-tint text-own border-own',
  competitor: 'bg-competitor-tint text-competitor border-competitor',
  third_party: 'bg-third-tint text-ink border-third',
};

/** Answer text with numbered citation markers coloured by ownership (UI/UX §4.5). */
export function AnswerWithCitations({ text, citations }: { text: string; citations: Citation[] }) {
  const cited = citations.filter((c) => c.kind === 'cited').sort((a, b) => a.position - b.position);
  const byPosition = new Map(cited.map((c) => [c.position, c]));
  const parts = text.split(/(\[\d{1,2}\])/g);

  return (
    <div className="space-y-4">
      <div className="brutal bg-surface p-4 text-sm leading-7">
        {parts.map((part, i) => {
          const m = part.match(/^\[(\d{1,2})\]$/);
          if (!m) return <span key={i}>{part}</span>;
          const c = byPosition.get(Number(m[1]));
          if (!c) return <span key={i} className="font-mono text-muted">{part}</span>;
          return (
            <sup key={i} className="mx-0.5">
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`${c.url} · ${c.pageType} · ${c.owner}`}
                className={`inline-flex size-5 items-center justify-center rounded border text-[10px] font-bold ${OWNER_CLASS[c.owner] ?? OWNER_CLASS.third_party}`}
              >
                {c.position}
              </a>
            </sup>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section>
          <h3 className="mb-1 font-display text-sm font-bold">Cited URLs, in order</h3>
          <ol className="space-y-1.5">
            {cited.map((c) => (
              <li key={`${c.position}-${c.url}`} className="flex items-start gap-2 border border-ink/20 bg-surface p-2 text-xs">
                <span className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border font-bold ${OWNER_CLASS[c.owner] ?? OWNER_CLASS.third_party}`}>{c.position}</span>
                <div className="min-w-0">
                  <UrlPill url={c.url} owner={c.owner as 'own' | 'competitor' | 'third_party'} pageType={c.pageType} />
                  {c.citedText && <p className="mt-1 line-clamp-2 text-muted">&ldquo;{c.citedText}&rdquo;</p>}
                </div>
              </li>
            ))}
            {cited.length === 0 && <li className="border border-ink/20 bg-surface p-2 text-xs text-muted">No sources cited — the engine answered from memory. That is data, not an error.</li>}
          </ol>
        </section>

        <section>
          <h3 className="mb-1 font-display text-sm font-bold">Retrieved, not cited</h3>
          <details className="border border-ink/20 bg-surface p-2 text-xs">
            <summary className="cursor-pointer font-medium">
              {citations.filter((c) => c.kind === 'retrieved').length} URLs seen but not referenced
            </summary>
            <ul className="mt-2 space-y-1">
              {citations.filter((c) => c.kind === 'retrieved').map((c) => (
                <li key={c.url} className="flex flex-wrap items-center gap-1">
                  <UrlPill url={c.url} owner={c.owner as 'own' | 'competitor' | 'third_party'} pageType={c.pageType} />
                  <PageTypeChip type={c.pageType} />
                </li>
              ))}
              {citations.filter((c) => c.kind === 'retrieved').length === 0 && <li className="text-muted">This provider did not expose retrieved results for this answer.</li>}
            </ul>
          </details>
          <p className="mt-2 text-[11px] text-muted">Retrieved results are exposed by some providers only. Absence is not evidence that nothing else was retrieved.</p>
        </section>
      </div>
    </div>
  );
}
