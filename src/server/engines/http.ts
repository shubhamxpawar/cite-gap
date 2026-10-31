// Shared provider HTTP helper: timeout + typed error classification (TRD §4).
import { BadResponseError, classifyProviderError, TimeoutError, ProviderDownError } from './errors';
import type { EngineId } from './types';

export async function postJson(
  engine: EngineId,
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs = 45_000,
): Promise<{ json: unknown; latencyMs: number }> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new TimeoutError(engine, { cause: err });
    }
    throw new ProviderDownError(engine, { cause: err });
  }
  const latencyMs = Date.now() - started;
  if (!res.ok) throw classifyProviderError(engine, res.status);
  try {
    return { json: (await res.json()) as unknown, latencyMs };
  } catch (err) {
    throw new BadResponseError(engine, { message: 'response was not valid JSON', cause: err });
  }
}

export function requireString(value: unknown, what: string, engine: EngineId): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadResponseError(engine, { message: `missing ${what} in provider response` });
  }
  return value;
}
