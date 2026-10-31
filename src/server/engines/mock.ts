// Deterministic mock engine — docs/decisions.md D2.
// Impersonates real engine ids so the whole pipeline + demo run without provider keys.
// Output is clearly synthetic: `raw.mock = true` and the UI shows a "demo data" label.
import type { EngineAdapter, EngineCitation, EngineId, EngineResult } from './types';
import { classifyPage } from '@/server/pipeline/classify-page';

export interface MockDomainContext {
  ownDomains: string[];
  competitorDomains: string[];
}

const THIRD_PARTY = [
  { host: 'g2.com', path: '/categories', title: 'Best software categories' },
  { host: 'reddit.com', path: '/r/SaaS', title: 'SaaS community discussions' },
  { host: 'en.wikipedia.org', path: '/wiki/Software_as_a_service', title: 'Software as a service' },
  { host: 'zapier.com', path: '/blog/best-apps', title: 'The best apps and tools' },
  { host: 'capterra.com', path: '/categories', title: 'Software reviews and pricing' },
  { host: 'producthunt.com', path: '/topics/productivity', title: 'Productivity products' },
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function intentOf(prompt: string): 'pricing' | 'comparison' | 'docs' | 'alternatives' {
  if (/\b(vs|versus|compare|comparison)\b/i.test(prompt)) return 'comparison';
  if (/\balternatives?\b|\bcompetitors?\b/i.test(prompt)) return 'alternatives';
  if (/\b(price|pricing|cost|cheap|budget|per month)\b/i.test(prompt)) return 'pricing';
  if (/\b(docs?|api|how|set ?up|import|integrat|guide|tutorial)\b/i.test(prompt)) return 'docs';
  return 'pricing';
}

function pathFor(kind: 'pricing' | 'comparison' | 'docs' | 'alternatives', seed: number): string {
  if (kind === 'pricing') return ['/pricing', '/plans', '/pricing'][seed % 3];
  if (kind === 'comparison') return ['/vs/competitor', '/compare', '/comparison'][seed % 3];
  if (kind === 'alternatives') return ['/alternatives', '/best-alternatives', '/alternatives'][seed % 3];
  return ['/docs/getting-started', '/docs', '/api/reference'][seed % 3];
}

/** Builds the deterministic citation set for one (prompt, engine) pair. */
export function mockCitations(prompt: string, engine: EngineId, ctx: MockDomainContext): EngineCitation[] {
  const h = hash(`${engine}:${prompt}`);
  const intent = intentOf(prompt);
  const own = ctx.ownDomains[0] ?? 'example.com';
  const competitors = ctx.competitorDomains.filter(Boolean);
  const citations: EngineCitation[] = [];

  const add = (url: string, title: string, kind: EngineCitation['kind'] = 'cited') => {
    citations.push({ url, title, position: citations.length + 1, kind, citedText: title });
  };

  if (competitors.length) {
    const first = competitors[h % competitors.length];
    const second = competitors[(h + 1) % competitors.length];
    add(`https://${first}${pathFor(intent, h)}`, `${first} — ${intent} page`);
    if (intent === 'pricing') add(`https://${second}/pricing`, `${second} pricing`);
    if (intent === 'comparison') add(`https://${first}/alternatives`, `${first} alternatives`);
  } else {
    const a = THIRD_PARTY[h % THIRD_PARTY.length];
    const b = THIRD_PARTY[(h + 2) % THIRD_PARTY.length];
    add(`https://${a.host}${a.path}`, a.title);
    add(`https://${b.host}${b.path}`, b.title);
  }

  // one retrieved-but-not-cited result (Anthropic-style) to exercise the UI accordion
  const extra = THIRD_PARTY[(h + 4) % THIRD_PARTY.length];
  add(`https://${extra.host}${extra.path}`, extra.title, 'retrieved');

  // own page is cited occasionally, deterministically — gives the dashboard wins and the verify loop material
  if (h % 4 === 0) {
    const ownPath = pathFor(intent, h);
    add(`https://${own}${ownPath}`, `${own} — ${classifyPage(ownPath)} page`);
  }
  return citations;
}

export function createMockAdapter(engine: EngineId, ctx: MockDomainContext): EngineAdapter {
  return {
    id: engine,
    async run(prompt): Promise<EngineResult> {
      const h = hash(prompt);
      const citations = mockCitations(prompt, engine, ctx);
      const cited = citations.filter((c) => c.kind === 'cited');
      const lines = [
        `Here is a concise answer based on current sources.`,
        '',
        ...cited.slice(0, 3).map((c, i) => `${i + 1}. ${c.title ?? c.url} [${c.position}]`),
        '',
        'Sources were retrieved from the web. This is synthetic demo output from the mock engine.',
      ];
      // deterministic jitter so progress feels alive without being random
      await new Promise((r) => setTimeout(r, 60 + (h % 140)));
      return {
        engine,
        model: `mock-${engine}-v1`,
        answerText: lines.join('\n'),
        citations,
        searchQueries: [prompt],
        raw: { mock: true, prompt, engine, note: 'synthetic response generated without a provider API key' },
        latencyMs: 60 + (h % 140),
        costUsd: 0,
      };
    },
  };
}
