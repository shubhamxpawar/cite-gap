// OpenAI Responses API + web_search tool — docs/01-TRD.md §4 provider notes.
// Citations are `url_citation` annotations on output_text; issued queries live on web_search_call items.
import type { EngineAdapter, EngineCitation, EngineResult } from './types';
import { BadResponseError } from './errors';
import { postJson } from './http';
import { estimateCostUsd } from './cost';

interface OpenAiAnnotation {
  type: string;
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}
interface OpenAiOutputText {
  type: 'output_text';
  text?: string;
  annotations?: OpenAiAnnotation[];
}
interface OpenAiItem {
  type: string;
  action?: { query?: string };
  content?: OpenAiOutputText[];
}
interface OpenAiResponse {
  model?: string;
  output?: OpenAiItem[];
}

/** Pure parser (exported for fixture contract tests). */
export function parseOpenAiResponse(json: unknown): { answerText: string; citations: EngineCitation[]; searchQueries: string[]; model: string } {
  const data = json as OpenAiResponse;
  if (!data || !Array.isArray(data.output)) {
    throw new BadResponseError('chatgpt', { message: 'missing output array' });
  }
  const searchQueries: string[] = [];
  const annotated: { url: string; title?: string; start: number; text: string }[] = [];
  let answerText = '';

  for (const item of data.output) {
    if (item.type === 'web_search_call' && item.action?.query) searchQueries.push(item.action.query);
    if (item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part.type !== 'output_text' || typeof part.text !== 'string') continue;
      answerText += (answerText ? '\n' : '') + part.text;
      for (const a of part.annotations ?? []) {
        if (a.type !== 'url_citation' || !a.url) continue;
        annotated.push({ url: a.url, title: a.title, start: a.start_index ?? Number.MAX_SAFE_INTEGER, text: part.text });
      }
    }
  }

  annotated.sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  const citations: EngineCitation[] = [];
  for (const a of annotated) {
    if (seen.has(a.url)) continue;
    seen.add(a.url);
    citations.push({
      url: a.url,
      title: a.title,
      position: citations.length + 1,
      kind: 'cited',
      citedText: a.text.slice(0, 240),
    });
  }
  return { answerText, citations, searchQueries, model: data.model ?? '' };
}

export function createOpenAiAdapter(model: string, apiKey: string): EngineAdapter {
  return {
    id: 'chatgpt',
    async run(prompt, opts = {}): Promise<EngineResult> {
      const { json, latencyMs } = await postJson(
        'chatgpt',
        'https://api.openai.com/v1/responses',
        {
          model,
          tools: [{ type: 'web_search' }],
          input: prompt,
          ...(opts.country ? { user_location: { type: 'approximate', country: opts.country } } : {}),
        },
        { authorization: `Bearer ${apiKey}` },
        opts.timeoutMs ?? 45_000,
      );
      const parsed = parseOpenAiResponse(json);
      return {
        engine: 'chatgpt',
        model: parsed.model || model,
        answerText: parsed.answerText,
        citations: parsed.citations,
        searchQueries: parsed.searchQueries,
        raw: json,
        latencyMs,
        costUsd: estimateCostUsd('chatgpt', { toolCalls: Math.max(1, parsed.searchQueries.length) }),
      };
    },
  };
}
