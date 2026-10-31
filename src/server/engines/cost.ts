import type { EngineId } from './types';

// 'mock' is not an EngineId (the mock engine impersonates real engine ids), but it needs a cost row: it is always free.
export type CostKey = EngineId | 'mock';

export interface EngineCostEntry {
  /** All-in typical cost per call (model tokens + one search), from docs/unit-economics.md. Used when usage is unknown. */
  perCallUsd: number;
  /** Model token cost per call, used as the base when usage.toolCalls is supplied. */
  basePerCallUsd: number;
  /** Price of one search/tool invocation ($10/1k searches for OpenAI/Anthropic, $35/1k for Gemini grounding). */
  perToolCallUsd: number;
}

export const ENGINE_COST: Record<CostKey, EngineCostEntry> = {
  chatgpt: { perCallUsd: 0.007, basePerCallUsd: 0.002, perToolCallUsd: 0.01 },
  claude: { perCallUsd: 0.012, basePerCallUsd: 0.002, perToolCallUsd: 0.01 },
  perplexity: { perCallUsd: 0.008, basePerCallUsd: 0.008, perToolCallUsd: 0 },
  gemini: { perCallUsd: 0.02, basePerCallUsd: 0.002, perToolCallUsd: 0.035 },
  mock: { perCallUsd: 0, basePerCallUsd: 0, perToolCallUsd: 0 },
};

export interface EngineUsage {
  inputTokens?: number;
  outputTokens?: number;
  toolCalls?: number;
}

export function estimateCostUsd(engine: CostKey, usage?: EngineUsage): number {
  const entry = ENGINE_COST[engine];
  if (usage?.toolCalls != null) return entry.basePerCallUsd + usage.toolCalls * entry.perToolCallUsd;
  return entry.perCallUsd;
}
