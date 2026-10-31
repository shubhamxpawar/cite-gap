// Verbatim from docs/01-TRD.md §4 "Engine adapter contract". Do not edit without updating the TRD.
export type EngineId = 'chatgpt' | 'claude' | 'perplexity' | 'gemini';

export interface EngineCitation {
  url: string;              // raw URL as returned (resolve redirects for gemini)
  title?: string;
  position: number;         // 1-based order of first appearance in answer
  kind: 'cited' | 'retrieved'; // cited = referenced in answer; retrieved = search result seen but not cited
  citedText?: string;       // snippet the engine attributed, if provided
}

export interface EngineResult {
  engine: EngineId;
  model: string;            // exact model string used
  answerText: string;
  citations: EngineCitation[];
  searchQueries: string[];  // queries the engine issued, if exposed
  raw: unknown;             // full provider JSON, stored for replay
  latencyMs: number;
  costUsd: number;          // estimated from usage + tool-call pricing table
}

export interface EngineAdapter {
  id: EngineId;
  run(prompt: string, opts: { country?: string; timeoutMs?: number }): Promise<EngineResult>;
}
