import { request } from '@fphd/express/testing';
import { describe, expect, it } from 'vitest';

import { createApp, STALLED_AFTER_MS } from './app.ts';

describe('createApp', () => {
  it('stays live while sweeps keep ending', async () => {
    const app = createApp({ lastSweepCompletedAt: () => Date.now() - STALLED_AFTER_MS + 1_000 });

    const live = await request(app).get('/livez');

    expect(live.status).toBe(200);
    expect(live.body).toEqual({ status: 'ok', service: 'internal-worker' });
  });

  it('fails liveness once no sweep has ended for five minutes, and stays ready', async () => {
    const app = createApp({ lastSweepCompletedAt: () => Date.now() - STALLED_AFTER_MS });

    const live = await request(app).get('/livez');
    const ready = await request(app).get('/readyz');

    expect(live.status).toBe(503);
    expect(live.body).toEqual({ status: 'stalled', service: 'internal-worker' });
    expect(ready.status).toBe(200);
  });
});
