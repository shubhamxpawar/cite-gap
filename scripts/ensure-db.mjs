// Pre-flight hook for `npm run dev` / `npm run start`.
// The app talks to the local embedded Postgres on :54322; if it is not running,
// the Next server boots fine but every query fails with an opaque
// "Failed query" error. Start Postgres here first instead of crashing at login.
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PG_PORT ?? 54322);
const DATA_DIR = 'pgdata';

function tryConnect() {
  return new Promise((resolve) => {
    const s = net.connect({ port: PORT, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.setTimeout(2_000, () => { s.destroy(); resolve(false); });
  });
}

if (await tryConnect()) {
  process.exit(0);
}
if (!fs.existsSync(DATA_DIR)) {
  console.warn(`[ensure-db] no Postgres data dir at ./${DATA_DIR} — run \`node scripts/db.mjs init\` once, or this checkout's setup first.`);
}

console.log(`[ensure-db] embedded Postgres not listening on :${PORT} — starting it…`);
const child = spawn(process.execPath, ['scripts/db.mjs', 'up'], {
  detached: true,
  stdio: 'ignore',
  env: { ...process.env },
});
child.unref();

for (let attempt = 0; attempt < 60; attempt++) {
  await new Promise((r) => setTimeout(r, 1_000));
  if (await tryConnect()) {
    console.log('[ensure-db] postgres is ready');
    process.exit(0);
  }
}
console.error(`[ensure-db] embedded Postgres did not start on :${PORT} within 60s — try \`node scripts/db.mjs up\` manually to see the error.`);
process.exit(1);
