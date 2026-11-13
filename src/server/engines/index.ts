// Engine registry — docs/01-TRD.md §4. Real adapter when a key exists, otherwise the
// deterministic mock (docs/decisions.md D2) when ENABLE_MOCK_ENGINE allows it.
import type { EngineAdapter, EngineId } from './types';
import { createOpenAiAdapter } from './openai';
import { createAnthropicAdapter } from './anthropic';
import { createPerplexityAdapter } from './perplexity';
import { createGeminiAdapter } from './gemini';
import { createMockAdapter, type MockDomainContext } from './mock';
import { configuredSearchProvider } from './search';

export interface ConfiguredEngine extends EngineAdapter {
  model: string;
  mock: boolean;
}

export const ENGINE_ORDER: EngineId[] = ['chatgpt', 'claude', 'perplexity', 'gemini'];

export const ENGINE_MODEL_ENV: Record<EngineId, string> = {
  chatgpt: 'OPENAI_MODEL',
  claude: 'ANTHROPIC_MODEL',
  perplexity: 'PERPLEXITY_MODEL',
  gemini: 'GEMINI_MODEL',
};

const DEFAULT_MODELS: Record<EngineId, string> = {
  chatgpt: 'gpt-4.1-mini',
  claude: 'claude-sonnet-4-20250514',
  perplexity: 'sonar',
  gemini: 'gemini-3.5-flash-lite',
};

const KEY_ENV: Record<EngineId, string> = {
  chatgpt: 'OPENAI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

export function mockEngineEnabled(): boolean {
  const flag = process.env.ENABLE_MOCK_ENGINE;
  if (flag === '1') return true;
  if (flag === '0') return false;
  return process.env.NODE_ENV !== 'production';
}

export function engineModel(id: EngineId): string {
  return process.env[ENGINE_MODEL_ENV[id]] || DEFAULT_MODELS[id];
}

/** True when the engine can run at all (real key or mock fallback). */
export function isEngineConfigured(id: EngineId): boolean {
  return Boolean(process.env[KEY_ENV[id]]) || mockEngineEnabled();
}

/** True when at least one real provider key is configured. */
export function hasRealEngine(): boolean {
  return ENGINE_ORDER.some((id) => Boolean(process.env[KEY_ENV[id]]));
}

export function isEngineMocked(id: EngineId): boolean {
  return !process.env[KEY_ENV[id]] && mockEngineEnabled();
}

function build(id: EngineId, ctx: MockDomainContext): ConfiguredEngine | null {
  const key = process.env[KEY_ENV[id]];
  const model = engineModel(id);
  if (key) {
    const adapter =
      id === 'chatgpt' ? createOpenAiAdapter(model, key)
      : id === 'claude' ? createAnthropicAdapter(model, key)
      : id === 'perplexity' ? createPerplexityAdapter(model, key)
      : createGeminiAdapter(model, key, configuredSearchProvider());
    return Object.assign(adapter, { model, mock: false });
  }
  if (mockEngineEnabled()) {
    return Object.assign(createMockAdapter(id, ctx), { model: `mock-${id}-v1`, mock: true });
  }
  return null;
}

export function getEnabledEngines(ownDomains: string[], competitorDomains: string[]): ConfiguredEngine[] {
  const ctx: MockDomainContext = { ownDomains, competitorDomains };
  return ENGINE_ORDER.map((id) => build(id, ctx)).filter((e): e is ConfiguredEngine => e !== null);
}

/**
 * Engines a run should use: real, key-backed engines when any exist, otherwise
 * mocks, capped by the plan. Without this, a free workspace would spend its
 * 2-engine budget on mocked engines and never touch the real key that is
 * configured — and the mock engine invents URLs that do not exist.
 */
export function selectEngines(
  ownDomains: string[],
  competitorDomains: string[],
  opts: { max?: number; only?: EngineId[] } = {},
): ConfiguredEngine[] {
  const max = opts.max ?? ENGINE_ORDER.length;
  const enabled = getEnabledEngines(ownDomains, competitorDomains).filter((e) => !opts.only || opts.only.includes(e.id));
  const real = enabled.filter((e) => !e.mock);
  return (real.length ? real : enabled)
    .sort((a, b) => ENGINE_ORDER.indexOf(a.id) - ENGINE_ORDER.indexOf(b.id))
    .slice(0, max);
}

/**
 * Engines the UI should advertise. The seeded demo workspace always shows all
 * four so the walkthrough stays intact; everywhere else unconfigured paid
 * engines are hidden, and mocks only appear when no real key exists.
 */
export function visibleEngines(opts: { demo?: boolean } = {}): EngineId[] {
  if (opts.demo) return [...ENGINE_ORDER];
  const enabled = getEnabledEngines([], []);
  const real = enabled.filter((e) => !e.mock);
  return (real.length ? real : enabled).map((e) => e.id);
}

export function getEngineById(id: EngineId, ctx: MockDomainContext): ConfiguredEngine | null {
  return build(id, ctx);
}

export type { EngineId } from './types';
