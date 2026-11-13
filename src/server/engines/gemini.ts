// Gemini adapter — docs/01-TRD.md §4 provider notes.
//
// Two modes:
// 1. Search-grounded (preferred for free keys): a free search API supplies the
//    sources, Gemini answers from them and cites [n]. Google Search grounding is
//    not available on the Gemini API free tier (Nov 2026).
// 2. Native Google Search grounding: used when no search provider is configured.
//    Requires a paid-tier Gemini project; groundingChunks[].web.uri are redirect
//    URLs, resolved with ≤3 hops, 3 s timeout, cached.
import type { EngineAdapter, EngineCitation, EngineResult } from './types';
import { BadResponseError, EngineError } from './errors';
import { postJson } from './http';
import { estimateCostUsd } from './cost';
import { buildSearchPrompt, parseSearchGroundedAnswer, type SearchProvider } from './search';

const redirectCache = new Map<string, string>();

export async function resolveGeminiRedirect(uri: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const cached = redirectCache.get(uri);
  if (cached) return cached;
  let current = uri;
  try {
    for (let hop = 0; hop < 3; hop++) {
      const res = await fetchImpl(current, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(3_000),
      });
      const location = res.headers.get('location');
      if (res.status < 300 || res.status >= 400 || !location) break;
      current = new URL(location, current).toString();
    }
  } catch {
    // keep the original redirect URL; the report still shows something clickable
  }
  redirectCache.set(uri, current);
  return current;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
    };
  }[];
}

export async function parseGeminiResponse(
  json: unknown,
  resolve: (uri: string) => Promise<string> = resolveGeminiRedirect,
): Promise<{ answerText: string; citations: EngineCitation[]; searchQueries: string[]; model: string }> {
  const data = json as GeminiResponse;
  if (!data || !Array.isArray(data.candidates)) {
    throw new BadResponseError('gemini', { message: 'missing candidates array' });
  }
  const candidate = data.candidates[0];
  const answerText = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');
  const meta = candidate?.groundingMetadata ?? {};
  const chunks = meta.groundingChunks ?? [];

  const urls = await Promise.all(chunks.map((c) => (c.web?.uri ? resolve(c.web.uri) : Promise.resolve(''))));
  const seen = new Set<string>();
  const citations: EngineCitation[] = [];
  chunks.forEach((chunk, i) => {
    const url = urls[i];
    if (!url || seen.has(url)) return;
    seen.add(url);
    citations.push({ url, title: chunk.web?.title, position: citations.length + 1, kind: 'cited' });
  });

  return {
    answerText,
    citations,
    searchQueries: meta.webSearchQueries ?? [],
    model: '',
  };
}

export function createGeminiAdapter(model: string, apiKey: string, search: SearchProvider | null = null): EngineAdapter {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  return {
    id: 'gemini',
    async run(prompt, opts = {}): Promise<EngineResult> {
      const timeoutMs = opts.timeoutMs ?? 45_000;

      if (search) {
        const results = await search.search(prompt, { maxResults: 8, timeoutMs });
        if (!results.length) throw new BadResponseError('gemini', { message: 'search returned no results' });

        const { json, latencyMs } = await postJson(
          'gemini',
          endpoint,
          { contents: [{ parts: [{ text: buildSearchPrompt(prompt, results) }] }] },
          {},
          timeoutMs,
        );
        const parsed = await parseGeminiResponse(json);
        const grounded = parseSearchGroundedAnswer(parsed.answerText, results);
        return {
          engine: 'gemini',
          model: `${model}+${search.name}`,
          answerText: grounded.answerText,
          citations: grounded.citations,
          searchQueries: [prompt],
          raw: { gemini: json, search: { provider: search.name, results } },
          latencyMs,
          costUsd: estimateCostUsd('gemini'),
        };
      }

      let json: unknown;
      let latencyMs: number;
      try {
        ({ json, latencyMs } = await postJson(
          'gemini',
          endpoint,
          {
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
          },
          {},
          timeoutMs,
        ));
      } catch (err) {
        // Grounding is paid-tier only on the Gemini API (Nov 2026); make the
        // failure actionable instead of a bare 429/404. Timeouts and provider
        // outages keep their own error so retries still make sense.
        const quotaOrMissing =
          err instanceof EngineError &&
          (err.kind === 'RateLimited' || (err.kind === 'BadResponse' && (err.providerStatus === 404 || err.providerStatus === 429)));
        if (!quotaOrMissing) throw err;
        throw new BadResponseError('gemini', {
          message:
            'Gemini could not use Google Search grounding (paid-tier only). Add a free TAVILY_API_KEY (https://app.tavily.com) or enable billing on the Gemini project.',
          cause: err,
        });
      }
      const parsed = await parseGeminiResponse(json);
      return {
        engine: 'gemini',
        model,
        answerText: parsed.answerText,
        citations: parsed.citations,
        searchQueries: parsed.searchQueries,
        raw: json,
        latencyMs,
        costUsd: estimateCostUsd('gemini', { toolCalls: parsed.citations.length ? 1 : 0 }),
      };
    },
  };
}
