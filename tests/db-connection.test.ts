import { afterEach, describe, expect, it } from 'vitest';
import { isPooledConnection, poolMax } from '@/server/db/connection';

const original = { prepare: process.env.PG_PREPARE, max: process.env.PG_POOL_MAX };

afterEach(() => {
  if (original.prepare === undefined) delete process.env.PG_PREPARE;
  else process.env.PG_PREPARE = original.prepare;
  if (original.max === undefined) delete process.env.PG_POOL_MAX;
  else process.env.PG_POOL_MAX = original.max;
});

describe('isPooledConnection', () => {
  it('detects Supabase transaction pooler (port 6543)', () => {
    expect(isPooledConnection('postgres://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres')).toBe(true);
  });

  it('detects Neon pooled hostnames and PgBouncer ports', () => {
    expect(isPooledConnection('postgres://u:p@ep-cool-123-pooler.eu-central-1.aws.neon.tech/citegap')).toBe(true);
    expect(isPooledConnection('postgres://u:p@db.internal:6432/citegap')).toBe(true);
  });

  it('leaves direct connections on prepared statements', () => {
    expect(isPooledConnection('postgres://u:p@db.example.com:5432/citegap')).toBe(false);
    expect(isPooledConnection('postgres://postgres:postgres@localhost:54322/citegap')).toBe(false);
  });

  it('honours PG_PREPARE=0 as an explicit opt-out', () => {
    process.env.PG_PREPARE = '0';
    expect(isPooledConnection('postgres://u:p@db.example.com:5432/citegap')).toBe(true);
  });
});

describe('poolMax', () => {
  it('keeps the client pool small behind a pooler', () => {
    expect(poolMax('postgres://u:p@db.example.com:6543/citegap')).toBe(3);
    expect(poolMax('postgres://u:p@db.example.com:5432/citegap')).toBe(5);
  });

  it('accepts PG_POOL_MAX', () => {
    process.env.PG_POOL_MAX = '8';
    expect(poolMax('postgres://u:p@db.example.com:5432/citegap')).toBe(8);
  });
});
