import { MAX_AREA_CODES_PER_REQUEST } from '@fphd/public-api-features/contract';
import { createFakeApiClient } from '@fphd/web-server/testing';
import { expect, it } from 'vitest';
import { benchmarkFixture } from './benchmark.testing.ts';
import { loadBenchmarkData, loadBenchmarkMemberships } from './benchmark-loader.ts';

it('batches and resolves deprivation, neighbours and combined-authority memberships', async () => {
  const fixture = benchmarkFixture();
  const client = createFakeApiClient({
    'GET /api/areas/deprivation': fixture.memberships,
    'GET /api/areas/neighbours': [{ code: 'E08000003', neighbours: ['E08000001'] }],
    'GET /api/areas/parents': [
      { code: 'E08000003', parentCode: 'E47000001', parentName: 'Greater Manchester' },
    ],
  });
  const codes = Array.from(
    { length: MAX_AREA_CODES_PER_REQUEST + 1 },
    (_, index) => `E${String(index).padStart(8, '0')}`,
  );
  const memberships = await loadBenchmarkMemberships(client, codes);
  expect(memberships.neighboursByCode).toEqual({ E08000003: ['E08000001'] });
  expect(memberships.caByCode).toEqual({
    E08000003: { code: 'E47000001', name: 'Greater Manchester' },
  });
  expect(memberships.deprivation).toContainEqual(fixture.memberships[0]);
  expect(client.calls.length).toBe(6);
  for (const { path } of client.calls)
    expect(new URL(path, 'http://api').searchParams.getAll('areaCode').length).toBeLessThanOrEqual(
      MAX_AREA_CODES_PER_REQUEST,
    );
});

it('fetches category and region ranges and batches only neighbours and CAs not already loaded', async () => {
  const fixture = benchmarkFixture();
  const client = createFakeApiClient({
    'GET /api/indicators/108/range': {
      periods: fixture.ranges['england:upper'] ?? [],
    },
  });
  const batches: string[][] = [];
  const data = await loadBenchmarkData(
    client,
    '108',
    fixture.benchmarks,
    fixture.geography,
    async (codes) => {
      batches.push(codes);
      return fixture.benchmarkData.filter(({ areaCode }) => codes.includes(areaCode));
    },
    [...fixture.areaData, ...fixture.regionData, ...fixture.benchmarkData.slice(0, 1)],
  );
  expect(batches.flat().sort()).toEqual(['E08000002', 'E47000001', 'E47000002']);
  expect(data.benchmarkData.map(({ areaCode }) => areaCode)).toEqual([
    'E08000001',
    'E08000002',
    'E47000001',
  ]);
  expect(Object.keys(data.ranges).sort()).toEqual(
    [
      ...fixture.memberships.map(({ dimensionValueId }) => dimensionValueId),
      'england:upper',
      'region:E12000002:upper',
      'region:E12000009:upper',
    ].sort(),
  );
  expect(client.calls.filter(({ path }) => path.includes('/range?category='))).toHaveLength(4);
  expect(
    client.calls.filter(({ path }) => path.includes('&parent=')).map(({ path }) => path),
  ).toEqual([
    '/api/indicators/108/range?tier=upper&parent=E12000002',
    '/api/indicators/108/range?tier=upper&parent=E12000009',
  ]);
});

it('deduplicates region ranges by parent and display level and skips areas without a region', async () => {
  const fixture = benchmarkFixture();
  const geography = {
    levelByCode: {
      E10000032: 'Upper-tier local authorities',
      E10000011: 'Upper-tier local authorities',
      E07000223: 'Lower-tier local authorities',
      E06000052: 'Upper-tier local authorities',
    },
    regionByCode: Object.fromEntries(
      ['E10000032', 'E10000011', 'E07000223'].map((code) => [
        code,
        { code: 'E12000008', name: 'South East' },
      ]),
    ),
  };
  const client = createFakeApiClient({ 'GET /api/indicators/241/range': { periods: [] } });
  const data = await loadBenchmarkData(
    client,
    '241',
    ['region', 'region'],
    geography,
    async () => [],
    [],
  );
  expect(client.calls.map(({ path }) => path)).toEqual([
    '/api/indicators/241/range?tier=upper&parent=E12000008',
    '/api/indicators/241/range?tier=lower&parent=E12000008',
  ]);
  expect(Object.keys(data.ranges)).toEqual(['region:E12000008:upper', 'region:E12000008:lower']);
  const withoutRanges = createFakeApiClient({});
  await loadBenchmarkData(
    withoutRanges,
    '241',
    fixture.benchmarks,
    geography,
    async () => [],
    [],
    false,
  );
  expect(withoutRanges.calls).toEqual([]);
});

it('deduplicates England ranges by council tier and preserves other geography ranges', async () => {
  const geography = {
    levelByCode: {
      E10000032: 'Upper-tier local authorities',
      E06000052: 'Upper-tier local authorities',
      E07000223: 'Lower-tier local authorities',
      E54000026: 'Integrated care boards',
    },
    regionByCode: {},
  };
  const client = createFakeApiClient({ 'GET /api/indicators/241/range': { periods: [] } });
  await loadBenchmarkData(client, '241', ['england'], geography, async () => [], []);
  expect(client.calls.map(({ path }) => path)).toEqual([
    '/api/indicators/241/range?tier=upper',
    '/api/indicators/241/range?tier=lower',
    '/api/indicators/241/range?displayGroup=Integrated%20care%20boards',
  ]);
});
