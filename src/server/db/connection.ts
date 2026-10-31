/**
 * Connection-string helpers for Postgres. Kept free of side effects so both the
 * Drizzle client and tests can use them.
 *
 * Transaction-mode poolers (Supabase :6543, Neon `-pooler`, PgBouncer :6432)
 * multiplex clients onto few server connections and discard session state, so
 * postgres.js prepared statements break behind them. See deploy/synteq.md.
 */
export function isPooledConnection(url: string): boolean {
  const override = process.env.PG_PREPARE;
  if (override === '0' || override === 'false') return true;
  if (override === '1' || override === 'true') return false;
  try {
    const parsed = new URL(url);
    return /pooler/i.test(parsed.hostname) || parsed.port === '6543' || parsed.port === '6432';
  } catch {
    return false;
  }
}

export function poolMax(url: string): number {
  const configured = Number(process.env.PG_POOL_MAX ?? '');
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  // A pooler already caps server connections; a small client pool is enough.
  return isPooledConnection(url) ? 3 : 5;
}
