// Free web search for the Gemini adapter.
//
// Google Search grounding is not available on the Gemini API free tier (Nov
// 2026), so a free real run pairs Gemini's free text model with a free search
// API and asks Gemini to cite the numbered results. Tavily's free plan is
// 1,000 credits/month with no card; Brave and Serper are supported too.
import { BadResponseError } from './errors';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  name: string;
  search(query: string, opts?: { maxResults?: number; timeoutMs?: number }): Promise<SearchResult[]>;
}

async function postJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new BadResponseError('gemini', { message: `search request failed: ${err instanceof Error ? err.message : String(err)}`, cause: err });
  }
  if (!res.ok) throw new BadResponseError('gemini', { message: `search provider returned ${res.status}`, providerStatus: res.status });
  try {
    return (await res.json()) as unknown;
  } catch (err) {
    throw new BadResponseError('gemini', { message: 'search provider returned invalid JSON', cause: err });
  }
}

async function getJson(url: string, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new BadResponseError('gemini', { message: `search request failed: ${err instanceof Error ? err.message : String(err)}`, cause: err });
  }
  if (!res.ok) throw new BadResponseError('gemini', { message: `search provider returned ${res.status}`, providerStatus: res.status });
  try {
    return (await res.json()) as unknown;
  } catch (err) {
    throw new BadResponseError('gemini', { message: 'search provider returned invalid JSON', cause: err });
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function tavily(apiKey: string): SearchProvider {
  return {
    name: 'tavily',
    async search(query, opts = {}) {
      const json = (await postJson(
        'https://api.tavily.com/search',
        { query, search_depth: 'basic', max_results: opts.maxResults ?? 8, include_answer: false },
        { authorization: `Bearer ${apiKey}` },
        opts.timeoutMs ?? 15_000,
      )) as { results?: { title?: unknown; url?: unknown; content?: unknown }[] };
      return (json.results ?? [])
        .map((r) => ({ title: str(r.title), url: str(r.url), snippet: str(r.content) }))
        .filter((r) => r.url);
    },
  };
}

function brave(apiKey: string): SearchProvider {
  return {
    name: 'brave',
    async search(query, opts = {}) {
      const count = opts.maxResults ?? 8;
      const json = (await getJson(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
        { 'x-subscription-token': apiKey, accept: 'application/json' },
        opts.timeoutMs ?? 15_000,
      )) as { web?: { results?: { title?: unknown; url?: unknown; description?: unknown }[] } };
      return (json.web?.results ?? [])
        .map((r) => ({ title: str(r.title), url: str(r.url), snippet: str(r.description) }))
        .filter((r) => r.url);
    },
  };
}

function serper(apiKey: string): SearchProvider {
  return {
    name: 'serper',
    async search(query, opts = {}) {
      const json = (await postJson(
        'https://google.serper.dev/search',
        { q: query, num: opts.maxResults ?? 8 },
        { 'x-api-key': apiKey },
        opts.timeoutMs ?? 15_000,
      )) as { organic?: { title?: unknown; link?: unknown; snippet?: unknown }[] };
      return (json.organic ?? [])
        .map((r) => ({ title: str(r.title), url: str(r.link), snippet: str(r.snippet) }))
        .filter((r) => r.url);
    },
  };
}

/** Every free search provider that has a key, in preference order. */
export function configuredSearchProviders(): SearchProvider[] {
  const providers: SearchProvider[] = [];
  if (process.env.TAVILY_API_KEY) providers.push(tavily(process.env.TAVILY_API_KEY));
  if (process.env.BRAVE_SEARCH_API_KEY) providers.push(brave(process.env.BRAVE_SEARCH_API_KEY));
  if (process.env.SERPER_API_KEY) providers.push(serper(process.env.SERPER_API_KEY));
  return providers;
}

/**
 * Tries each configured provider in order and returns the first that answers.
 * A revoked or mistyped key should not sink the whole run when another free
 * provider is available; `name` reflects whichever provider actually served.
 */
export function fallbackSearchProvider(providers: SearchProvider[]): SearchProvider | null {
  if (!providers.length) return null;
  if (providers.length === 1) return providers[0];
  const state = { used: providers.map((p) => p.name).join('/') };
  return {
    get name() {
      return state.used;
    },
    async search(query, opts = {}) {
      const failures: string[] = [];
      for (const provider of providers) {
        try {
          const results = await provider.search(query, opts);
          if (!results.length) throw new Error('no results');
          state.used = provider.name;
          return results;
        } catch (err) {
          failures.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      throw new BadResponseError('gemini', { message: `all search providers failed (${failures.join('; ')})` });
    },
  };
}

/** The configured free search path, or null when no search key is set. */
export function configuredSearchProvider(): SearchProvider | null {
  return fallbackSearchProvider(configuredSearchProviders());
}

export function buildSearchPrompt(prompt: string, results: SearchResult[]): string {
  const sources = results
    .map((r, i) => `[${i + 1}] ${r.title || r.url}\nURL: ${r.url}\n${r.snippet}`.trim())
    .join('\n\n');
  return [
    "Answer the buyer's question using only the numbered search results below.",
    'Write 2-4 sentences. Cite each factual claim with the matching bracket number, for example [1] or [2].',
    'Never invent a URL or a source number. If the results do not answer the question, say so briefly.',
    '',
    `Question: ${prompt}`,
    '',
    'Search results:',
    sources,
  ].join('\n');
}

export interface SearchGroundedAnswer {
  answerText: string;
  citations: { url: string; title?: string; position: number; kind: 'cited' }[];
}

/** Expands `1, 2`, `1 2`, or `1-3` inside one bracket into source numbers. */
function markerNumbers(content: string): number[] {
  const out: number[] = [];
  for (const part of content.split(',')) {
    const piece = part.trim();
    const range = piece.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (end >= start && end - start <= 10) for (let n = start; n <= end; n++) out.push(n);
      continue;
    }
    const n = Number(piece);
    if (Number.isInteger(n)) out.push(n);
  }
  return out;
}

/** Maps `[n]` markers in the answer to the search results that were actually cited. */
export function parseSearchGroundedAnswer(answerText: string, results: SearchResult[]): SearchGroundedAnswer {
  const seen = new Set<number>();
  const citations: SearchGroundedAnswer['citations'] = [];
  for (const match of answerText.matchAll(/\[([0-9][0-9,\s\-–]*)\]/g)) {
    for (const n of markerNumbers(match[1])) {
      const idx = n - 1;
      if (idx < 0 || idx >= results.length || seen.has(idx)) continue;
      seen.add(idx);
      const r = results[idx];
      citations.push({ url: r.url, title: r.title || undefined, position: citations.length + 1, kind: 'cited' });
    }
  }
  return { answerText, citations };
}
