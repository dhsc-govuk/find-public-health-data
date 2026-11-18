import { topicAdminSummaryListSchema } from '@fphd/internal-api-features/contract';
import { createFakeApiClient } from '@fphd/web-server/testing';
import { describe, expect, it } from 'vitest';

import { createPreviewApiClient, UnpreviewedApiPathError } from './api-client.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const PREVIEW = `/api/internal/indicators/${ID}/preview`;

describe('createPreviewApiClient', () => {
  it.each([
    '/api/indicators/108',
    '/api/indicators/a-draft/areas?limit=101',
    '/api/indicators/108/data?areaCode=E92000001',
    '/api/indicators/108/range?displayGroup=Regions',
    '/api/indicators/108/ranking?areaCode=E92000001',
    '/api/indicators?q=diabetes&limit=20',
    '/api/indicator-data?indicator=108&areaCode=E92000001',
    '/api/indicator-scatter?indicator=108&indicator=241&areaCode=E92000001',
    '/api/areas?displayGroup=Regions',
    '/api/areas/display-groups',
    '/api/areas/lookup?areaCode=E06000001',
    '/api/areas/neighbours?areaCode=E06000001',
    '/api/areas/parents?areaCode=E06000001&parentType=Regions',
    '/api/areas/search?q=Leeds',
  ])('asks the preview API for %s', async (path) => {
    const api = createFakeApiClient({ [`GET ${PREVIEW}${path.split('?')[0]}`]: [] });

    await createPreviewApiClient(api, ID).get(path, topicAdminSummaryListSchema);

    expect(api.calls.map((call) => call.path)).toEqual([`${PREVIEW}${path}`]);
  });

  it.each([
    '/api/topics',
    '/api/topics/diabetes/trends',
    '/api/indicators/108/unknown',
    `/api/internal/indicators/${ID}`,
  ])('refuses %s, a path the preview has none for, without asking the API', async (path) => {
    const api = createFakeApiClient();

    await expect(
      createPreviewApiClient(api, ID).get(path, topicAdminSummaryListSchema),
    ).rejects.toBeInstanceOf(UnpreviewedApiPathError);
    expect(api.calls).toEqual([]);
  });

  it('refuses every write', async () => {
    const api = createFakeApiClient();
    const preview = createPreviewApiClient(api, ID);
    const any = topicAdminSummaryListSchema;

    await expect(preview.post('/api/indicators', {}, any, any)).rejects.toThrow(
      UnpreviewedApiPathError,
    );
    await expect(preview.put('/api/indicators/108', {}, any, any)).rejects.toThrow(
      UnpreviewedApiPathError,
    );
    await expect(preview.delete('/api/indicators/108', any)).rejects.toThrow(
      UnpreviewedApiPathError,
    );
    expect(api.calls).toEqual([]);
  });
});
