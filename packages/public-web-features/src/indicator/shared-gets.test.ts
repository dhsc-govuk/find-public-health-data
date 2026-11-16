import {
  areaDisplayGroupListSchema,
  displayGroupListSchema,
} from '@fphd/public-api-features/contract';
import { createFakeApiClient } from '@fphd/web-server/testing';
import { expect, it } from 'vitest';
import { createSharedGetsClient } from './shared-gets.ts';

it('sends a repeated GET once and gives every caller its answer', async () => {
  const api = createFakeApiClient({ 'GET /api/areas/display-groups': ['Local authorities'] });
  const shared = createSharedGetsClient(api);
  const path = '/api/areas/display-groups';
  const answers = await Promise.all([
    shared.get(path, displayGroupListSchema),
    shared.get(path, displayGroupListSchema),
  ]);
  expect(answers).toEqual([['Local authorities'], ['Local authorities']]);
  expect(await shared.get(path, displayGroupListSchema)).toEqual(['Local authorities']);
  expect(api.calls).toHaveLength(1);
});

it('sends a GET for another path or schema separately', async () => {
  const api = createFakeApiClient({ 'GET /api/areas': [] });
  const shared = createSharedGetsClient(api);
  await shared.get('/api/areas?displayGroup=Regions', displayGroupListSchema);
  await shared.get('/api/areas?displayGroup=Counties', displayGroupListSchema);
  await shared.get('/api/areas?displayGroup=Regions', areaDisplayGroupListSchema);
  expect(api.calls.map(({ path }) => path)).toEqual([
    '/api/areas?displayGroup=Regions',
    '/api/areas?displayGroup=Counties',
    '/api/areas?displayGroup=Regions',
  ]);
});
