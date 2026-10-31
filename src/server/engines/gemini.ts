// Gemini + Google Search grounding (P1) — docs/01-TRD.md §4 provider notes.
// groundingMetadata.groundingChunks[].web.uri are redirect URLs; resolve with ≤3 hops, 3 s timeout, cached.
import type { EngineAdapter, EngineCitation, EngineResult } from './types';
import { BadResponseError } from './errors';
import { postJson } from './http';
import { estimateCostUsd } from './cost';

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
    content?: { parts?: { text?: string }[] };
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
  const answerText = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('');
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

export function createGeminiAdapter(model: string, apiKey: string): EngineAdapter {
  return {
    id: 'gemini',
    async run(prompt, opts = {}): Promise<EngineResult> {
      const { json, latencyMs } = await postJson(
        'gemini',
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
        },
        {},
        opts.timeoutMs ?? 45_000,
      );
      const parsed = await parseGeminiResponse(json);
      const data = json as GeminiResponse;
      return {
        engine: 'gemini',
        model: data.candidates?.[0] ? model : model,
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
