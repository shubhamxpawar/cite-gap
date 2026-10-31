import type { EngineId } from './types';

// Kinds match the TRD §4 rule: adapters MUST throw typed errors RateLimited | Timeout | ProviderDown | BadResponse.
export type EngineErrorKind = 'RateLimited' | 'Timeout' | 'ProviderDown' | 'BadResponse';

export interface EngineErrorOptions {
  message?: string;
  providerStatus?: number;
  cause?: unknown;
}

export class EngineError extends Error {
  readonly kind: EngineErrorKind;
  readonly engine: EngineId;
  readonly providerStatus?: number;
  readonly retryable: boolean;

  constructor(kind: EngineErrorKind, engine: EngineId, retryable: boolean, opts: EngineErrorOptions = {}) {
    super(opts.message ?? `${kind} from engine ${engine}`, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = new.target.name;
    this.kind = kind;
    this.engine = engine;
    this.providerStatus = opts.providerStatus;
    this.retryable = retryable;
  }
}

export class RateLimitedError extends EngineError {
  constructor(engine: EngineId, opts: EngineErrorOptions = {}) {
    super('RateLimited', engine, true, {
      message: opts.message ?? `engine ${engine} is rate limited`,
      providerStatus: opts.providerStatus ?? 429,
      cause: opts.cause,
    });
  }
}

export class TimeoutError extends EngineError {
  constructor(engine: EngineId, opts: EngineErrorOptions = {}) {
    super('Timeout', engine, true, {
      message: opts.message ?? `engine ${engine} request timed out`,
      providerStatus: opts.providerStatus,
      cause: opts.cause,
    });
  }
}

export class ProviderDownError extends EngineError {
  constructor(engine: EngineId, opts: EngineErrorOptions = {}) {
    super('ProviderDown', engine, true, {
      message: opts.message ?? `engine ${engine} provider is unavailable`,
      providerStatus: opts.providerStatus,
      cause: opts.cause,
    });
  }
}

export class BadResponseError extends EngineError {
  constructor(engine: EngineId, opts: EngineErrorOptions = {}) {
    super('BadResponse', engine, false, {
      message: opts.message ?? `engine ${engine} returned an unexpected response`,
      providerStatus: opts.providerStatus,
      cause: opts.cause,
    });
  }
}

/** Maps an HTTP status from any provider to the typed error per TRD §4: 429→RateLimited, 408/timeout→Timeout, 5xx→ProviderDown, else BadResponse. */
export function classifyProviderError(engine: EngineId, status: number): EngineError {
  if (status === 429) return new RateLimitedError(engine, { providerStatus: status });
  if (status === 408) return new TimeoutError(engine, { providerStatus: status });
  if (status >= 500) return new ProviderDownError(engine, { providerStatus: status, message: `engine ${engine} returned ${status}` });
  return new BadResponseError(engine, { providerStatus: status, message: `engine ${engine} returned unexpected status ${status}` });
}
