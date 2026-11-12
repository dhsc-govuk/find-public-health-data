import { createFakeApiClient } from '@fphd/web-server/testing';
import { expect, it } from 'vitest';
import { findGeographyGroups, loadGeographyOptions } from './loader.ts';

it('filters the complete local-authority catalogue by tier before limiting a picker preview', async () => {
  const areas = [
    ...Array.from({ length: 110 }, (_, i) => ({
      code: `E07${String(i).padStart(6, '0')}`,
      name: `District ${i}`,
    })),
    ...Array.from({ length: 105 }, (_, i) => ({
      code: `E06${String(i).padStart(6, '0')}`,
      name: `Unitary ${i}`,
    })),
  ];
  const api = createFakeApiClient({
    'GET /api/indicators/diabetes/areas?displayGroup=Local+authorities': [
      { displayGroup: 'Local authorities', areas },
    ],
  });
  const result = await findGeographyGroups(api, {
    level: 'Upper-tier local authorities',
    indicator: 'diabetes',
    publicOnly: true,
  });
  expect(result[0]?.areas).toHaveLength(101);
  expect(result[0]?.areas.every((area) => area.code.startsWith('E06'))).toBe(true);
});

it('uses public tier labels in the initial server-rendered picker without loading GP catalogues', async () => {
  const localAuthorities = [
    {
      displayGroup: 'Local authorities',
      areas: [
        { code: 'E10000001', name: 'County' },
        { code: 'E07000001', name: 'District' },
      ],
    },
  ];
  const api = createFakeApiClient({
    'GET /api/areas?displayGroup=Local%20authorities&limit=101': localAuthorities,
    'GET /api/areas?displayGroup=Local%20authorities': localAuthorities,
  });
  const result = await loadGeographyOptions(
    api,
    new URLSearchParams(),
    ['Upper-tier local authorities', 'Lower-tier local authorities'],
    { publicOnly: true },
  );
  expect(result.previews).toEqual([
    { name: 'Upper-tier local authorities', areas: [{ code: 'E10000001', name: 'County' }] },
    { name: 'Lower-tier local authorities', areas: [{ code: 'E07000001', name: 'District' }] },
  ]);
  expect(api.calls.map(({ path }) => path)).toEqual([
    '/api/areas?displayGroup=Local%20authorities&limit=101',
    '/api/areas?displayGroup=Local%20authorities',
  ]);
});
