import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import openaiFixture from './fixtures/openai-response.json';
import anthropicFixture from './fixtures/anthropic-response.json';
import perplexityFixture from './fixtures/perplexity-response.json';
import geminiFixture from './fixtures/gemini-response.json';
import { parseOpenAiResponse } from '@/server/engines/openai';
import { parseAnthropicResponse } from '@/server/engines/anthropic';
import { parsePerplexityResponse } from '@/server/engines/perplexity';
import { parseGeminiResponse } from '@/server/engines/gemini';
import { classifyProviderError, RateLimitedError, TimeoutError, ProviderDownError, BadResponseError } from '@/server/engines/errors';
import { estimateCostUsd, ENGINE_COST } from '@/server/engines/cost';
import { mockCitations } from '@/server/engines/mock';
import { selectEngines, visibleEngines } from '@/server/engines';
import { buildSearchPrompt, fallbackSearchProvider, parseSearchGroundedAnswer, type SearchProvider } from '@/server/engines/search';

describe('engine contract tests (fixtures, no live calls)', () => {
  it('OpenAI: extracts url_citation with url, title and 1-based position', () => {
    const r = parseOpenAiResponse(openaiFixture);
    expect(r.citations.length).toBe(2);
    expect(r.citations[0]).toMatchObject({ url: 'https://acme.com/pricing', title: 'Acme Pricing', position: 1, kind: 'cited' });
    expect(r.citations[1].position).toBe(2);
    expect(r.searchQueries).toEqual(['best crm for small business pricing']);
    expect(r.model).toBe('gpt-4.1-mini-2025-04-14');
  });

  it('Anthropic: cited results first, retrieved-not-cited returned as kind=retrieved', () => {
    const r = parseAnthropicResponse(anthropicFixture);
    const cited = r.citations.filter((c) => c.kind === 'cited');
    const retrieved = r.citations.filter((c) => c.kind === 'retrieved');
    expect(cited).toHaveLength(1);
    expect(cited[0]).toMatchObject({ url: 'https://acme.com/pricing', position: 1, citedText: 'Plans start at $19 per seat.' });
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0]).toMatchObject({ url: 'https://g2.com/categories/crm', position: 2 });
    expect(r.searchQueries).toEqual(['acme pricing per seat']);
  });

  it('Perplexity: [n] markers map to citations[n-1] and position follows first appearance', () => {
    const r = parsePerplexityResponse(perplexityFixture);
    expect(r.citations[0]).toMatchObject({ url: 'https://acme.com/pricing', position: 1, kind: 'cited' });
    expect(r.citations[1]).toMatchObject({ url: 'https://rival.com/pricing', position: 2, kind: 'cited' });
    expect(r.citations[0].title).toBe('Acme Pricing');
  });

  it('Gemini: resolves grounding redirect URLs and keeps cited order', async () => {
    const r = await parseGeminiResponse(geminiFixture, async (uri) =>
      uri.includes('vertexaisearch') ? 'https://acme.com/pricing' : uri,
    );
    expect(r.citations).toHaveLength(2);
    expect(r.citations[0]).toMatchObject({ url: 'https://acme.com/pricing', position: 1 });
    expect(r.citations[1]).toMatchObject({ url: 'https://rival.com/pricing', position: 2 });
    expect(r.searchQueries).toEqual(['best crm for small business']);
  });

  it('rejects malformed provider payloads with BadResponse', () => {
    expect(() => parseOpenAiResponse({})).toThrow(BadResponseError);
    expect(() => parseAnthropicResponse({ content: 'nope' })).toThrow(BadResponseError);
    expect(() => parsePerplexityResponse({ choices: null })).toThrow(BadResponseError);
  });
});

describe('typed provider errors (TRD §4)', () => {
  it('maps 429 to RateLimited', () => {
    const err = classifyProviderError('chatgpt', 429);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(err.retryable).toBe(true);
  });
  it('maps 408 to Timeout', () => {
    expect(classifyProviderError('claude', 408)).toBeInstanceOf(TimeoutError);
  });
  it('maps 5xx to ProviderDown', () => {
    expect(classifyProviderError('perplexity', 503)).toBeInstanceOf(ProviderDownError);
  });
  it('maps other statuses to non-retryable BadResponse', () => {
    const err = classifyProviderError('gemini', 400);
    expect(err).toBeInstanceOf(BadResponseError);
    expect(err.retryable).toBe(false);
  });
});

describe('cost math (TRD §9 / unit-economics)', () => {
  it('uses the per-call fallback when usage is unknown', () => {
    expect(estimateCostUsd('chatgpt')).toBe(ENGINE_COST.chatgpt.perCallUsd);
    expect(estimateCostUsd('mock')).toBe(0);
  });
  it('adds tool-call pricing when searches are reported', () => {
    expect(estimateCostUsd('chatgpt', { toolCalls: 2 })).toBeCloseTo(0.002 + 2 * 0.01, 6);
    expect(estimateCostUsd('gemini', { toolCalls: 1 })).toBeCloseTo(0.002 + 0.035, 6);
  });
  it('keeps the sample-report budget under $0.30 for 8 prompts × 2 engines', () => {
    const sampleCost = 8 * 2 * ENGINE_COST.chatgpt.perCallUsd + 8 * 2 * ENGINE_COST.perplexity.perCallUsd;
    expect(sampleCost).toBeLessThan(0.3);
  });
});

describe('engine selection (real keys first, plan-capped)', () => {
  const KEY_ENVS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'PERPLEXITY_API_KEY', 'GEMINI_API_KEY'] as const;
  const saved: Record<string, string | undefined> = {};

  function clearKeys() {
    for (const key of KEY_ENVS) delete process.env[key];
  }

  beforeEach(() => {
    for (const key of KEY_ENVS) saved[key] = process.env[key];
    clearKeys();
  });
  afterEach(() => {
    for (const key of KEY_ENVS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('runs only real engines when any key exists, even with mocks enabled', () => {
    process.env.ENABLE_MOCK_ENGINE = '1';
    process.env.GEMINI_API_KEY = 'test-key';
    const picked = selectEngines([], [], { max: 2 });
    expect(picked.map((e) => e.id)).toEqual(['gemini']);
    expect(picked.every((e) => !e.mock)).toBe(true);
  });

  it('falls back to mocks, capped by the plan, when no keys exist', () => {
    process.env.ENABLE_MOCK_ENGINE = '1';
    const picked = selectEngines([], [], { max: 2 });
    expect(picked).toHaveLength(2);
    expect(picked.every((e) => e.mock)).toBe(true);
  });

  it('returns no engines when mocks are off and no keys exist', () => {
    process.env.ENABLE_MOCK_ENGINE = '0';
    expect(selectEngines([], [])).toEqual([]);
    expect(visibleEngines()).toEqual([]);
  });

  it('keeps all four engines for the seeded demo workspace', () => {
    process.env.ENABLE_MOCK_ENGINE = '0';
    expect(visibleEngines({ demo: true })).toEqual(['chatgpt', 'claude', 'perplexity', 'gemini']);
  });

  it('hides unconfigured paid engines in the real UI', () => {
    process.env.ENABLE_MOCK_ENGINE = '0';
    process.env.GEMINI_API_KEY = 'test-key';
    expect(visibleEngines()).toEqual(['gemini']);
  });
});

describe('search-grounded Gemini (free-tier citation path)', () => {
  const results = [
    { title: 'Clip tool A', url: 'https://a.example/pricing', snippet: 'A clips podcasts.' },
    { title: 'Clip tool B', url: 'https://b.example/', snippet: 'B is free.' },
    { title: 'Review', url: 'https://c.example/review', snippet: 'Comparison of tools.' },
  ];

  it('numbers sources and includes their URLs in the prompt', () => {
    const prompt = buildSearchPrompt('best clip tool', results);
    expect(prompt).toContain('[1] Clip tool A');
    expect(prompt).toContain('URL: https://b.example/');
    expect(prompt).toContain('Question: best clip tool');
  });

  it('maps [n] markers to the cited results only, in first-appearance order', () => {
    const parsed = parseSearchGroundedAnswer('A is good [1]. C agrees [3], and A again [1].', results);
    expect(parsed.citations.map((c) => c.url)).toEqual(['https://a.example/pricing', 'https://c.example/review']);
    expect(parsed.citations.map((c) => c.position)).toEqual([1, 2]);
    expect(parsed.citations[0].title).toBe('Clip tool A');
  });

  it('ignores out-of-range and malformed markers', () => {
    const parsed = parseSearchGroundedAnswer('No source [9] or [x].', results);
    expect(parsed.citations).toEqual([]);
  });

  it('handles grouped and ranged markers such as [1, 3] and [1-2]', () => {
    const grouped = parseSearchGroundedAnswer('Tools differ [1, 3].', results);
    expect(grouped.citations.map((c) => c.url)).toEqual(['https://a.example/pricing', 'https://c.example/review']);
    const ranged = parseSearchGroundedAnswer('Both match [1-2].', results);
    expect(ranged.citations).toHaveLength(2);
  });
});

describe('free search provider fallback', () => {
  const ok: SearchProvider = {
    name: 'second',
    async search() {
      return [{ title: 'B', url: 'https://b.example/', snippet: 'B' }];
    },
  };

  it('skips a provider whose key is rejected', async () => {
    const broken: SearchProvider = {
      name: 'first',
      async search() {
        throw new BadResponseError('gemini', { message: 'search provider returned 401', providerStatus: 401 });
      },
    };
    const provider = fallbackSearchProvider([broken, ok])!;
    expect(provider).not.toBeNull();
    const found = await provider.search('q');
    expect(found.map((r) => r.url)).toEqual(['https://b.example/']);
    expect(provider.name).toBe('second');
  });

  it('treats an empty result set as a failure and moves on', async () => {
    const empty: SearchProvider = { name: 'empty', async search() { return []; } };
    const found = await fallbackSearchProvider([empty, ok])!.search('q');
    expect(found).toHaveLength(1);
  });

  it('reports every failure when no provider answers', async () => {
    const a: SearchProvider = { name: 'a', async search() { throw new Error('401'); } };
    const b: SearchProvider = { name: 'b', async search() { throw new Error('429'); } };
    await expect(fallbackSearchProvider([a, b])!.search('q')).rejects.toThrow(/all search providers failed \(a: 401; b: 429\)/);
  });

  it('returns null when nothing is configured', () => {
    expect(fallbackSearchProvider([])).toBeNull();
  });
});

describe('mock engine determinism (D2)', () => {
  it('produces the same citations for the same prompt and engine', () => {
    const ctx = { ownDomains: ['acme.com'], competitorDomains: ['rival.com'] };
    const a = mockCitations('best crm pricing', 'chatgpt', ctx);
    const b = mockCitations('best crm pricing', 'chatgpt', ctx);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(1);
  });
  it('cites tracked competitors for pricing prompts', () => {
    const ctx = { ownDomains: ['acme.com'], competitorDomains: ['rival.com', 'other.com'] };
    const citations = mockCitations('which crm is cheapest per month', 'perplexity', ctx);
    const hosts = citations.map((c) => new URL(c.url).hostname);
    expect(hosts.some((h) => h === 'rival.com' || h === 'other.com')).toBe(true);
  });
});
