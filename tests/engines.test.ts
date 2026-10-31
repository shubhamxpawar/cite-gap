import { describe, expect, it } from 'vitest';
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
