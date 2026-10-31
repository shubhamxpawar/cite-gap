// Perplexity Sonar — docs/01-TRD.md §4 provider notes.
// `citations` is a URL array; `[n]` markers in the text map to index n-1.
// Position is computed from first appearance of each marker; unreferenced URLs are 'retrieved'.
import type { EngineAdapter, EngineCitation, EngineResult } from './types';
import { BadResponseError } from './errors';
import { postJson } from './http';
import { estimateCostUsd } from './cost';

interface PerplexityResponse {
  model?: string;
  choices?: { message?: { content?: string } }[];
  citations?: string[];
  search_results?: { title?: string; url?: string; date?: string }[];
}

export function parsePerplexityResponse(json: unknown): { answerText: string; citations: EngineCitation[]; searchQueries: string[]; model: string } {
  const data = json as PerplexityResponse;
  if (!data || !Array.isArray(data.choices)) {
    throw new BadResponseError('perplexity', { message: 'missing choices array' });
  }
  const answerText = data.choices[0]?.message?.content ?? '';
  const urls = data.citations ?? [];
  const titles = new Map<string, string | undefined>();
  for (const r of data.search_results ?? []) if (r.url) titles.set(r.url, r.title);

  // map marker number → order of first appearance
  const firstSeen = new Map<number, number>();
  for (const m of answerText.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (!firstSeen.has(n)) firstSeen.set(n, firstSeen.size + 1);
  }

  const citations: EngineCitation[] = [];
  const used = new Set<string>();
  for (const [n, position] of [...firstSeen.entries()].sort((a, b) => a[1] - b[1])) {
    const url = urls[n - 1];
    if (!url || used.has(url)) continue;
    used.add(url);
    citations.push({ url, title: titles.get(url), position, kind: 'cited' });
  }
  let nextPosition = citations.length + 1;
  for (const url of urls) {
    if (used.has(url)) continue;
    used.add(url);
    citations.push({ url, title: titles.get(url), position: nextPosition++, kind: 'retrieved' });
  }

  return { answerText, citations, searchQueries: [], model: data.model ?? '' };
}

export function createPerplexityAdapter(model: string, apiKey: string): EngineAdapter {
  return {
    id: 'perplexity',
    async run(prompt, opts = {}): Promise<EngineResult> {
      const { json, latencyMs } = await postJson(
        'perplexity',
        'https://api.perplexity.ai/chat/completions',
        {
          model,
          messages: [
            { role: 'system', content: 'Answer concisely with sources.' },
            { role: 'user', content: prompt },
          ],
        },
        { authorization: `Bearer ${apiKey}` },
        opts.timeoutMs ?? 45_000,
      );
      const parsed = parsePerplexityResponse(json);
      return {
        engine: 'perplexity',
        model: parsed.model || model,
        answerText: parsed.answerText,
        citations: parsed.citations,
        searchQueries: parsed.searchQueries,
        raw: json,
        latencyMs,
        costUsd: estimateCostUsd('perplexity'),
      };
    },
  };
}
