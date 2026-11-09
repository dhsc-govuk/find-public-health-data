import type { DataQuery, DataRowRecord } from '@fphd/db';
import { createFakeRepositories } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import express, { type Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { comparedToBenchmark, DATA_COLUMNS, dataRouter, endOf } from './data.ts';
import { expectToMatchSpec, specColumns } from './openapi.testing.ts';

const row: DataRowRecord = {
  shortId: 90366,
  indicatorSlug: 'life-expectancy-at-birth',
  indicatorName: 'Life expectancy at birth',
  polarity: 'higher-is-better',
  comparatorMethod: 'Confidence intervals overlapping reference value (95.0)',
  areaCode: 'E06000047',
  areaName: 'County Durham',
  areaLevel: 'counties-and-unitary-authorities',
  areaValidFrom: '2009-04-01',
  areaValidTo: null,
  fromDate: '2021-01-01',
  toDate: '2023-12-31',
  sex: 'f',
  age: '0-4',
  ageFromValue: 0,
  ageFromUnit: 'year',
  ageUnderValue: 5,
  ageUnderUnit: 'year',
  deprivation: null,
  deprivationGroups: null,
  deprivationScheme: null,
  ethnicity: null,
  ethnicityScheme: null,
  socioeconomicGroup: null,
  socioeconomicGroupScheme: null,
  religion: null,
  religionScheme: null,
  sexuality: null,
  sexualityScheme: null,
  category1Type: null,
  category1: null,
  value: 81.2,
  lowerCi95: 80.9,
  upperCi95: 81.5,
  lowerCi998: 80.7,
  upperCi998: 81.7,
  count: null,
  numerator: null,
  denominator: null,
  note: 'n101',
  benchmarkCode: 'E92000001',
  benchmarkValue: 83,
};

async function* batches(...lists: DataRowRecord[][]): AsyncIterable<DataRowRecord[]> {
  yield* lists;
}

const levels = [
  { slug: 'england', name: 'England', hierarchy: null, parentLevels: [] },
  {
    slug: 'regions',
    name: 'Regions',
    hierarchy: 'administrative' as const,
    parentLevels: ['england'],
  },
  {
    slug: 'counties-and-unitary-authorities',
    name: 'Counties and unitary authorities',
    hierarchy: 'administrative' as const,
    parentLevels: ['regions', 'england'],
  },
];

function createTestApp(stream = vi.fn((_query: DataQuery) => batches([row]))): Express {
  const app = express();
  app.use(
    dataRouter(
      createFakeRepositories({
        reference: { dataVersion: async () => 'v1' },
        areas: {
          listLevels: async () => levels,
          find: async () => [
            {
              code: 'E06000047',
              name: 'County Durham',
              level: 'counties-and-unitary-authorities',
              validFrom: null,
              validTo: null,
            },
          ],
          listAncestors: async () => [
            {
              code: 'E12000001',
              name: 'North East',
              level: 'regions',
              validFrom: null,
              validTo: null,
              depth: 1,
            },
          ],
        },
        data: { stream },
      }),
    ),
  );
  return app;
}

describe('endOf', () => {
  it.each([
    ['2022', '2022-12-31'],
    ['2024-02', '2024-02-29'],
    ['2023-02', '2023-02-28'],
    ['2022-03-15', '2022-03-15'],
  ])('takes %s as ending %s', (partial, date) => {
    expect(endOf(partial)).toBe(date);
  });
});

describe('comparedToBenchmark', () => {
  it.each([
    ['worse', { lowerCi95: 80.9, upperCi95: 81.5, benchmarkValue: 83 }],
    ['better', { lowerCi95: 84, upperCi95: 85, benchmarkValue: 83 }],
    ['similar', { lowerCi95: 82, upperCi95: 84, benchmarkValue: 83 }],
  ] as const)('judges %s where higher is better', (expected, values) => {
    expect(comparedToBenchmark({ ...row, ...values })).toBe(expected);
  });

  it('says higher or lower where neither is better', () => {
    expect(
      comparedToBenchmark({ ...row, polarity: 'no-polarity', lowerCi95: 84, upperCi95: 85 }),
    ).toBe('higher');
  });

  it('compares at 99.8% where the method names only that', () => {
    expect(
      comparedToBenchmark({
        ...row,
        comparatorMethod: 'Confidence intervals overlapping reference value (99.8)',
        lowerCi95: 83.5,
        lowerCi998: 82.5,
        upperCi998: 84,
      }),
    ).toBe('similar');
  });

  it('makes no comparison where the method makes none or a value is missing', () => {
    expect(comparedToBenchmark({ ...row, comparatorMethod: 'No comparison' })).toBe('not-compared');
    expect(comparedToBenchmark({ ...row, benchmarkValue: null })).toBe('not-compared');
  });

  it("is empty for the benchmark's own row", () => {
    expect(comparedToBenchmark({ ...row, areaCode: 'E92000001' })).toBeNull();
  });
});

describe('GET /v0/data', () => {
  it("writes the spec's columns in CSV, in order", async () => {
    const response = await request(createTestApp()).get('/v0/data');

    expect(DATA_COLUMNS).toEqual(specColumns('DataRow'));
    const [header, first] = response.text.split('\r\n');
    expect(header).toBe(DATA_COLUMNS.join(','));
    expect(first).toBe(
      '90366,life-expectancy-at-birth,Life expectancy at birth,E06000047,County Durham,counties-and-unitary-authorities,2009-04-01,,2021-01-01,2023-12-31,f,0-4,P0Y,P5Y,,,,,,,,,,,,,,81.2,80.9,81.5,80.7,81.7,,,,n101,E92000001,worse',
    );
  });

  it('streams JSON rows that match the spec', async () => {
    const app = createTestApp(vi.fn(() => batches([row], [{ ...row, sex: 'm' }])));
    const response = await request(app).get('/v0/data').set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expectToMatchSpec('/v0/data', 200, response.body);
    expect(response.body.data.map((data: { sex: string }) => data.sex)).toEqual(['f', 'm']);
  });

  it('links to the metadata document and the indicators in the request', async () => {
    const response = await request(createTestApp()).get('/v0/data?indicator=90366');

    expect(response.headers.link).toBe(
      '</v0/data/metadata?indicator=90366>; rel="describedby"; type="application/csvm+json", </v0/indicators?shortId=90366>; rel="describedby"; type="application/json"',
    );
  });

  it('turns parameters into a query, with an empty item asking for rows not broken down', async () => {
    const stream = vi.fn((_query: DataQuery) => batches());
    await request(createTestApp(stream)).get(
      '/v0/data?indicator=90366,108&areaType=regions&boundaries=2021&to=2022-03&latest=5&sex=m,&ageFrom=P50Y&ageUnder=P70Y&benchmark=england',
    );

    expect(stream).toHaveBeenCalledWith({
      shortIds: [90366, 108],
      areas: { kind: 'level', level: 'regions', boundaries: '2021-01-01' },
      to: '2022-03-31',
      latest: 5,
      benchmark: 'england',
      filters: { sex: { values: ['m'], empty: true } },
      ageRange: { from: 50 * 365.25, under: 70 * 365.25 },
    });
  });

  it("adds an area's parents and England with include=parents", async () => {
    const stream = vi.fn((_query: DataQuery) => batches());
    await request(createTestApp(stream)).get('/v0/data?area=E06000047&include=parents');

    expect(stream.mock.calls[0]?.[0].areas).toEqual({
      kind: 'codes',
      codes: ['E06000047', 'E12000001', 'E92000001'],
    });
  });

  it.each([
    ['area=E06000047&areaType=regions', 'areaType'],
    ['latest=1&from=2020', 'from'],
    ['parent=E12000001', 'parent'],
    ['include=parents', 'include'],
    ['area=E06000047&include=statistical-neighbours', 'include'],
    ['areaType=counties', 'areaType'],
    ['benchmark=ccgs', 'benchmark'],
    ['sex=M', 'sex'],
    ['ageFrom=50', 'ageFrom'],
  ])('refuses %s', async (query, name) => {
    const response = await request(createTestApp()).get(`/v0/data?${query}`);

    expect(response.status).toBe(400);
    expect(response.body.invalidParams.map((param: { name: string }) => param.name)).toContain(
      name,
    );
  });
});

describe('GET /v0/data/metadata', () => {
  it('describes the columns and points at the catalogue', async () => {
    const response = await request(createTestApp()).get('/v0/data/metadata?indicator=90366');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/csvm\+json/);
    expectToMatchSpec('/v0/data/metadata', 200, response.body, 'application/csvm+json');
    expect(response.body.url).toBe('/v0/data?indicator=90366');
    expect(response.body['rdfs:seeAlso']).toBe('/v0/indicators?shortId=90366');
    expect(response.body.tableSchema.columns).toHaveLength(DATA_COLUMNS.length);
  });
});
