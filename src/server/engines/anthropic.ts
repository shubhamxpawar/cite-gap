// Anthropic Messages API + web_search server tool — docs/01-TRD.md §4 provider notes.
// Text-block citations are `kind:'cited'`; web_search_tool_result blocks list everything
// retrieved, so entries not cited in the answer are returned as `kind:'retrieved'`.
import type { EngineAdapter, EngineCitation, EngineResult } from './types';
import { BadResponseError } from './errors';
import { postJson } from './http';
import { estimateCostUsd } from './cost';

interface AnthropicCitation {
  type: string;
  url?: string;
  title?: string;
  cited_text?: string;
}
interface AnthropicBlock {
  type: string;
  text?: string;
  citations?: AnthropicCitation[];
  name?: string;
  input?: { query?: string };
  content?: { type: string; url?: string; title?: string }[];
}
interface AnthropicResponse {
  model?: string;
  content?: AnthropicBlock[];
}

export function parseAnthropicResponse(json: unknown): { answerText: string; citations: EngineCitation[]; searchQueries: string[]; model: string } {
  const data = json as AnthropicResponse;
  if (!data || !Array.isArray(data.content)) {
    throw new BadResponseError('claude', { message: 'missing content array' });
  }
  let answerText = '';
  const cited: EngineCitation[] = [];
  const retrieved: { url: string; title?: string }[] = [];
  const searchQueries: string[] = [];

  for (const block of data.content) {
    if (block.type === 'server_tool_use' && block.name === 'web_search' && block.input?.query) {
      searchQueries.push(block.input.query);
    }
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r.url) retrieved.push({ url: r.url, title: r.title });
    }
    if (block.type === 'text' && typeof block.text === 'string') {
      answerText += (answerText ? '\n' : '') + block.text;
      for (const c of block.citations ?? []) {
        if (!c.url) continue;
        cited.push({
          url: c.url,
          title: c.title,
          position: 0,
          kind: 'cited',
          citedText: c.cited_text,
        });
      }
    }
  }

  // position = order of first appearance in the answer
  const seen = new Set<string>();
  const uniqueCited: EngineCitation[] = [];
  for (const c of cited) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    uniqueCited.push({ ...c, position: uniqueCited.length + 1 });
  }
  for (const r of retrieved) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    uniqueCited.push({ url: r.url, title: r.title, position: uniqueCited.length + 1, kind: 'retrieved' });
  }

  return { answerText, citations: uniqueCited, searchQueries, model: data.model ?? '' };
}

export function createAnthropicAdapter(model: string, apiKey: string): EngineAdapter {
  return {
    id: 'claude',
    async run(prompt, opts = {}): Promise<EngineResult> {
      const { json, latencyMs } = await postJson(
        'claude',
        'https://api.anthropic.com/v1/messages',
        {
          model,
          max_tokens: 1500,
          system: 'Answer concisely with sources.',
          messages: [{ role: 'user', content: prompt }],
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        },
        { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        opts.timeoutMs ?? 45_000,
      );
      const parsed = parseAnthropicResponse(json);
      return {
        engine: 'claude',
        model: parsed.model || model,
        answerText: parsed.answerText,
        citations: parsed.citations,
        searchQueries: parsed.searchQueries,
        raw: json,
        latencyMs,
        costUsd: estimateCostUsd('claude', { toolCalls: Math.max(1, parsed.searchQueries.length) }),
      };
    },
  };
}
