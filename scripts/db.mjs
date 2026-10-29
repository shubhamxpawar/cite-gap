// Local Postgres without Docker: runs real Postgres binaries as the current user.
// `node scripts/db.mjs up`    → initialise (first run), start, create `citegap`, stay in foreground
// `node scripts/db.mjs init`  → one-shot setup, then stop
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';

const DATA_DIR = 'pgdata';
const PORT = Number(process.env.PG_PORT ?? 54322);
const DB = 'citegap';

async function ensure(ctx) {
  if (!fs.existsSync(DATA_DIR)) {
    console.log('initialising postgres data dir…');
    await ctx.initialise();
  }
  await ctx.start();
  const dbs = await ctx.getPostgresDatabases?.();
  if (!dbs || !dbs.includes(DB)) {
    console.log(`creating database ${DB}…`);
    try {
      await ctx.createDatabase(DB);
    } catch (e) {
      if (e?.code !== '42P04') throw e; // already exists is fine
    }
  }
}

const mode = process.argv[2] ?? 'up';
const ctx = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
});

try {
  await ensure(ctx);
  console.log(`postgres ready on :${PORT} (db ${DB})`);
  if (mode === 'up') process.on('SIGINT', () => ctx.stop().then(() => process.exit(0)));
  else await ctx.stop();
} catch (e) {
  console.error(e);
  process.exit(1);
}
