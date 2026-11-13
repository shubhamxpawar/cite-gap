import { Inngest } from 'inngest';

// Local dev server (`npx inngest-cli dev`) needs no keys: INNGEST_DEV=1 points
// the SDK at http://localhost:8288 and disables signature verification.
// Cloud keys come from env when present.
const devMode = process.env.INNGEST_DEV === '1' || process.env.INNGEST_DEV_SERVER === '1';

export const inngest = new Inngest({
  id: 'citegap',
  eventKey: process.env.INNGEST_EVENT_KEY,
  isDev: devMode,
});
