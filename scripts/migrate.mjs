// Applies scripts/migrations/*.sql in order, tracked in _migrations.
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54322/citegap';
const sql = postgres(url, { onnotice: () => {} });

await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz default now())`;

const dir = path.join(import.meta.dirname, 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  const applied = await sql`select 1 from _migrations where name = ${file}`;
  if (applied.length) {
    console.log(`= ${file} (already applied)`);
    continue;
  }
  const body = fs.readFileSync(path.join(dir, file), 'utf8');
  // migrations contain multiple statements incl. DO blocks: use unsafe multi-statement
  await sql.unsafe(body);
  await sql`insert into _migrations (name) values (${file})`;
  console.log(`✓ ${file}`);
}

const tables = await sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`;
console.log(`tables in public: ${tables[0].n}`);
await sql.end();
