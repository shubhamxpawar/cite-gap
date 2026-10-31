// Own-page candidate matcher — docs/01-TRD.md §7 step 2.
// BM25-style keyword overlap between the prompt and candidate pages (title + text excerpt).
const STOP = new Set(['the', 'a', 'an', 'for', 'and', 'of', 'to', 'in', 'is', 'are', 'it', 'you', 'your', 'with', 'how', 'do', 'i', 'best', 'vs', 'or']);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export type CandidatePage = { id: string; url: string; title: string | null; pageType: string; textExcerpt?: string | null };

// candidates should already be filtered to own pages; returns best match or null (MISSING_PAGE)
export function matchOwnPage(prompt: string, candidates: CandidatePage[]): CandidatePage | null {
  if (candidates.length === 0) return null;
  const q = tokenize(prompt);
  if (q.length === 0) return null;

  // naive idf over the candidate set
  const df = new Map<string, number>();
  const docsTokens = candidates.map((c) => {
    const toks = new Set(tokenize(`${c.title ?? ''} ${c.url} ${c.textExcerpt ?? ''}`));
    for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1);
    return toks;
  });
  const N = candidates.length;

  let best: { c: CandidatePage; score: number } | null = null;
  for (let i = 0; i < candidates.length; i++) {
    let score = 0;
    for (const t of q) {
      if (!docsTokens[i].has(t)) continue;
      const idf = Math.log(1 + N / (1 + (df.get(t) ?? 0)));
      score += idf;
      // URL path keyword match is a strong signal (e.g. /pricing for a pricing prompt)
      if (candidates[i].url.toLowerCase().includes(t)) score += idf * 0.5;
    }
    if (!best || score > best.score) best = { c: candidates[i], score };
  }
  // require some minimum relevance
  return best && best.score > 0.5 ? best.c : null;
}
