import type { AreaFilters, AreaRepository, AreaRow } from '@fphd/db';
import { createFakeRepositories } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import express, { type Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { AREA_COLUMNS, AREA_TYPE_COLUMNS, areasRouter, startOf } from './areas.ts';
import { expectToMatchSpec, specColumns } from './openapi.testing.ts';

const durham: AreaRow = {
  code: 'E06000047',
  name: 'County Durham',
  level: 'counties-and-unitary-authorities',
  validFrom: '2009-04-01',
  validTo: null,
};
const northEast: AreaRow = {
  code: 'E12000001',
  name: 'North East',
  level: 'regions',
  validFrom: '2009-01-01',
  validTo: null,
};
const england: AreaRow = {
  code: 'E92000001',
  name: 'England',
  level: 'england',
  validFrom: '2009-01-01',
  validTo: null,
};

function createTestApp(areas: Partial<AreaRepository> = {}): Express {
  const repositories = createFakeRepositories({
    reference: { dataVersion: async () => 'v1' },
    areas: {
      listLevels: async () => [
        { slug: 'england', name: 'England', hierarchy: null, parentLevels: [] },
        {
          slug: 'regions',
          name: 'Regions',
          hierarchy: 'administrative',
          parentLevels: ['england'],
        },
        {
          slug: 'counties-and-unitary-authorities',
          name: 'Counties and unitary authorities',
          hierarchy: 'administrative',
          parentLevels: ['regions', 'england'],
        },
      ],
      ...areas,
    },
  });
  const app = express();
  app.use(areasRouter(repositories.areas, repositories.reference));
  return app;
}

async function getJson(app: Express, path: string) {
  return request(app).get(path).set('Accept', 'application/json');
}

describe('startOf', () => {
  it.each([
    ['2021', '2021-01-01'],
    ['2021-04', '2021-04-01'],
    ['2021-04-15', '2021-04-15'],
  ])('takes %s as %s', (partial, date) => {
    expect(startOf(partial)).toBe(date);
  });
});

describe('GET /v0/area-types', () => {
  it('lists the levels with their parents, nearest first', async () => {
    const response = await getJson(createTestApp(), '/v0/area-types');

    expect(response.status).toBe(200);
    expectToMatchSpec('/v0/area-types', 200, response.body);
    expect(response.body.data[2]).toEqual({
      slug: 'counties-and-unitary-authorities',
      name: 'Counties and unitary authorities',
      hierarchy: 'administrative',
      parentTypes: ['regions', 'england'],
    });
  });

  it('writes parent types separated by spaces in CSV', async () => {
    const response = await request(createTestApp()).get('/v0/area-types');

    expect(AREA_TYPE_COLUMNS).toEqual(specColumns('AreaType'));
    expect(response.text.split('\r\n')[3]).toBe(
      'counties-and-unitary-authorities,Counties and unitary authorities,administrative,regions england',
    );
  });
});

describe('GET /v0/areas', () => {
  it('finds the areas of a level as they stand today', async () => {
    const find = vi.fn(async (_filters: AreaFilters) => [durham]);
    const response = await getJson(
      createTestApp({ find }),
      '/v0/areas?areaType=counties-and-unitary-authorities',
    );

    expect(response.status).toBe(200);
    expectToMatchSpec('/v0/areas', 200, response.body);
    expect(response.body.data).toEqual([
      {
        code: 'E06000047',
        name: 'County Durham',
        type: 'counties-and-unitary-authorities',
        validFrom: '2009-04-01',
        validTo: null,
      },
    ]);
    expect(find).toHaveBeenCalledWith({
      level: 'counties-and-unitary-authorities',
      on: new Date().toISOString().slice(0, 10),
    });
  });

  it('takes boundaries on the first day of the date given', async () => {
    const find = vi.fn(async (_filters: AreaFilters) => []);
    await getJson(
      createTestApp({ find }),
      '/v0/areas?areaType=counties-and-unitary-authorities&boundaries=2020',
    );

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ on: '2020-01-01' }));
  });

  it('finds areas named by code whatever their boundaries', async () => {
    const find = vi.fn(async (_filters: AreaFilters) => [durham]);
    await getJson(createTestApp({ find }), '/v0/areas?area=E06000047');

    expect(find).toHaveBeenCalledWith({ codes: ['E06000047'] });
  });

  it('refuses area and areaType together', async () => {
    const response = await getJson(createTestApp(), '/v0/areas?area=E06000047&areaType=regions');

    expect(response.status).toBe(400);
    expect(response.body.invalidParams).toEqual([
      { name: 'areaType', reason: 'cannot be used with area' },
    ]);
  });

  it('refuses an area type that does not exist', async () => {
    const response = await getJson(createTestApp(), '/v0/areas?areaType=counties');

    expect(response.status).toBe(400);
  });

  it("writes the spec's columns in CSV", async () => {
    const response = await request(createTestApp({ find: async () => [durham] })).get(
      '/v0/areas?area=E06000047',
    );

    expect(AREA_COLUMNS).toEqual(specColumns('AreaRef'));
    expect(response.text.split('\r\n')[1]).toBe(
      'E06000047,County Durham,counties-and-unitary-authorities,2009-04-01,',
    );
  });
});

describe('GET /v0/areas/{code}', () => {
  it('returns the areas of the levels above it, adding England where no link says so', async () => {
    const app = createTestApp({
      find: async ({ codes }: AreaFilters) =>
        codes?.[0] === 'E92000001' ? [england] : codes?.[0] === 'E06000047' ? [durham] : [],
      listAncestors: async () => [
        { ...northEast, depth: 1 },
        { ...northEast, code: 'Cl_L2_6ar', level: 'ons-2011-groups', depth: 1 },
      ],
    });

    const response = await getJson(app, '/v0/areas/E06000047');

    expect(response.status).toBe(200);
    expectToMatchSpec('/v0/areas/{code}', 200, response.body);
    expect(response.body.parents.map((parent: { code: string }) => parent.code)).toEqual([
      'E12000001',
      'E92000001',
    ]);
  });

  it('answers 404 for a code no area has', async () => {
    const response = await getJson(createTestApp({ find: async () => [] }), '/v0/areas/X1');

    expect(response.status).toBe(404);
  });
});
