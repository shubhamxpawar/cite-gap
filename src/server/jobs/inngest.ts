import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'citegap',
  // Local dev server needs no keys; cloud keys come from env when present.
  eventKey: process.env.INNGEST_EVENT_KEY,
});
