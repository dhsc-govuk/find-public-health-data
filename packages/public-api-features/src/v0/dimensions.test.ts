import type { PublicDimensionTypeRow, PublicDimensionValueRow } from '@fphd/db';
import { createFakeRepositories } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import express, { type Express } from 'express';
import { describe, expect, it } from 'vitest';

import { DIMENSION_COLUMNS, dimensionsRouter } from './dimensions.ts';
import { expectToMatchSpec, specColumns } from './openapi.testing.ts';

const noScheme = { release: null, ranked: null, within: null, boundaries: null, groups: null };

const types: PublicDimensionTypeRow[] = [
  { id: 'sex', name: 'Sex', standardDimension: 'sex', slug: null, ...noScheme },
  { id: 'age', name: 'Age', standardDimension: 'age', slug: null, ...noScheme },
  {
    id: 'deciles',
    name: 'LSOA21 deprivation deciles in England (IMD2019)',
    standardDimension: 'deprivation',
    slug: 'imd2019-lsoa21-england',
    release: 'IMD2019',
    ranked: 'lsoa21',
    within: 'england',
    boundaries: null,
    groups: 10,
  },
  {
    id: 'quintiles',
    name: 'LSOA21 deprivation quintiles in England (IMD2019)',
    standardDimension: 'deprivation',
    slug: 'imd2019-lsoa21-england',
    release: 'IMD2019',
    ranked: 'lsoa21',
    within: 'england',
    boundaries: null,
    groups: 5,
  },
  { id: 'tenure', name: 'Tenure [23]', standardDimension: null, slug: 'tenure-4', ...noScheme },
];

const value = (
  dimensionTypeId: string,
  slug: string,
  name: string,
  age?: [number, 'year' | 'day', number | null, 'year' | 'day' | null],
): PublicDimensionValueRow => ({
  dimensionTypeId,
  slug,
  name,
  sortOrder: 0,
  ageFromValue: age?.[0] ?? null,
  ageFromUnit: age?.[1] ?? null,
  ageUnderValue: age?.[2] ?? null,
  ageUnderUnit: age?.[3] ?? null,
});

const values: PublicDimensionValueRow[] = [
  value('sex', 'm', 'Male'),
  value('sex', 'f', 'Female'),
  value('age', '0-4', '0-4 yrs', [0, 'year', 5, 'year']),
  value('age', '85-plus', '85+ yrs', [85, 'year', null, null]),
  value('age', 'newborn', 'Newborn'),
  value('deciles', '1', 'Most deprived decile'),
  value('deciles', '10', 'Least deprived decile'),
  value('quintiles', '1', 'Most deprived quintile'),
  value('quintiles', '5', 'Least deprived quintile'),
  value('tenure', 'owner-occupied', 'Owner occupied'),
];

function createTestApp(): Express {
  const app = express();
  app.use(
    dimensionsRouter(
      createFakeRepositories({
        reference: {
          dataVersion: async () => 'v1',
          listDimensions: async () => ({ types, values }),
        },
      }).reference,
    ),
  );
  return app;
}

async function getJson(path: string) {
  return request(createTestApp()).get(path).set('Accept', 'application/json');
}

describe('GET /v0/dimensions', () => {
  it('lists standard dimensions in order, then custom ones', async () => {
    const response = await getJson('/v0/dimensions');

    expect(response.status).toBe(200);
    expectToMatchSpec('/v0/dimensions', 200, response.body);
    expect(response.body.data).toEqual([
      { slug: 'sex', name: 'Sex', standard: true, hasSchemes: false },
      { slug: 'age', name: 'Age', standard: true, hasSchemes: false },
      { slug: 'deprivation', name: 'Deprivation', standard: true, hasSchemes: true },
      { slug: 'tenure-4', name: 'Tenure', standard: false, hasSchemes: false },
    ]);
  });

  it("writes the spec's columns in CSV", async () => {
    const response = await request(createTestApp()).get('/v0/dimensions');

    expect(DIMENSION_COLUMNS).toEqual(specColumns('Dimension'));
    expect(response.text.split('\r\n')[1]).toBe('sex,Sex,true,false');
  });
});

describe('GET /v0/dimensions/{dimension}', () => {
  it('lists the values of a dimension without schemes, with age ranges as durations', async () => {
    const response = await getJson('/v0/dimensions/age');

    expect(response.status).toBe(200);
    expectToMatchSpec('/v0/dimensions/{dimension}', 200, response.body);
    expect(response.body.values).toEqual([
      { slug: '0-4', name: '0-4 yrs', ageFrom: 'P0Y', ageUnder: 'P5Y' },
      { slug: '85-plus', name: '85+ yrs', ageFrom: 'P85Y', ageUnder: null },
      { slug: 'newborn', name: 'Newborn' },
    ]);
  });

  it('gathers the decile and quintile versions of a ranking into one scheme', async () => {
    const response = await getJson('/v0/dimensions/deprivation');

    expectToMatchSpec('/v0/dimensions/{dimension}', 200, response.body);
    expect(response.body.schemes).toEqual([
      {
        slug: 'imd2019-lsoa21-england',
        name: 'LSOA21 deprivation deciles in England (IMD2019)',
        structure: {
          release: 'IMD2019',
          ranked: 'lsoa21',
          within: 'england',
          boundaries: null,
          groups: [5, 10],
        },
        values: [
          { slug: '1', name: 'Most deprived decile' },
          { slug: '10', name: 'Least deprived decile' },
          { slug: '5', name: 'Least deprived quintile' },
        ],
      },
    ]);
  });

  it('answers 404 for a dimension that does not exist', async () => {
    const response = await getJson('/v0/dimensions/colour');

    expect(response.status).toBe(404);
    expectToMatchSpec('/v0/dimensions/{dimension}', 404, response.body, 'application/problem+json');
  });

  it('returns JSON only', async () => {
    const response = await request(createTestApp())
      .get('/v0/dimensions/age')
      .set('Accept', 'text/csv');

    expect(response.status).toBe(406);
  });
});

describe('GET /v0/dimensions/{dimension}/schemes/{scheme}', () => {
  it('returns one scheme', async () => {
    const response = await getJson('/v0/dimensions/deprivation/schemes/imd2019-lsoa21-england');

    expect(response.status).toBe(200);
    expectToMatchSpec('/v0/dimensions/{dimension}/schemes/{scheme}', 200, response.body);
    expect(response.body.structure.groups).toEqual([5, 10]);
  });

  it('answers 404 for a scheme of another dimension', async () => {
    const response = await getJson('/v0/dimensions/ethnicity/schemes/imd2019-lsoa21-england');

    expect(response.status).toBe(404);
  });
});
