// Engine registry — docs/01-TRD.md §4. Real adapter when a key exists, otherwise the
// deterministic mock (docs/decisions.md D2) when ENABLE_MOCK_ENGINE allows it.
import type { EngineAdapter, EngineId } from './types';
import { createOpenAiAdapter } from './openai';
import { createAnthropicAdapter } from './anthropic';
import { createPerplexityAdapter } from './perplexity';
import { createGeminiAdapter } from './gemini';
import { createMockAdapter, type MockDomainContext } from './mock';

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
  gemini: 'gemini-2.0-flash',
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
      : createGeminiAdapter(model, key);
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

export function getEngineById(id: EngineId, ctx: MockDomainContext): ConfiguredEngine | null {
  return build(id, ctx);
}

export type { EngineId } from './types';
