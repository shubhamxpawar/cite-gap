import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54322/citegap';

// Server-side connection. Locally this role bypasses RLS (service-equivalent).
// Browser-scoped, RLS-enforced connections use `rlsClient(userId)` (tests + future Supabase swap).
const globalForDb = globalThis as unknown as { postgresClient?: postgres.Sql; drizzleDb?: ReturnType<typeof drizzle> };

export const sql = globalForDb.postgresClient ?? postgres(connectionString, { onnotice: () => {} });
if (!globalForDb.postgresClient) globalForDb.postgresClient = sql;

export const db = globalForDb.drizzleDb ?? drizzle(sql, { schema });
if (!globalForDb.drizzleDb) globalForDb.drizzleDb = db;

export { schema };

// Connection that enforces RLS by impersonating a user id via the local auth shim.
// Usage: const tx = rlsClient(userId); ... tx.dispose()
export function rlsClient(userId: string | null) {
  const claims = userId ? JSON.stringify({ sub: userId }) : '';
  const client = postgres(connectionString, {
    onnotice: () => {},
    connection: { 'request.jwt.claims': claims },
  });
  return client;
}
