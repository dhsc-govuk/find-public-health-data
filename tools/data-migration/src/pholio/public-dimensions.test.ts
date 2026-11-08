import { describe, expect, it } from 'vitest';

import {
  type DimensionValueInput,
  deprivationGroupOf,
  deprivationSchemeOf,
  publicDimensions,
  slugify,
} from './public-dimensions.ts';

describe('slugify', () => {
  it.each([
    ['Gay/lesbian', 'gay-lesbian'],
    ['<18', 'u18'],
    ['45+', '45-plus'],
    ['>=37 weeks gestational age at birth', 'ge-37-weeks-gestational-age-at-birth'],
    ["Don't know/Refused", 'dont-know-refused'],
    ['Black / African / Caribbean / Black British', 'black-african-caribbean-black-british'],
    ['Rural & urban', 'rural-and-urban'],
  ])('makes %s into %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });
});

describe('deprivationSchemeOf', () => {
  it.each([
    [
      'LSOA21 deprivation deciles in England (IMD2019)',
      { release: 'IMD2019', ranked: 'lsoa21', within: 'england', boundaries: null, groups: 10 },
    ],
    [
      'LSOA11 deprivation quintile within area (IMD2019)',
      { release: 'IMD2019', ranked: 'lsoa11', within: 'area', boundaries: null, groups: 5 },
    ],
    [
      'LSOA11 deprivation deciles within area (IMD  trend)',
      { release: 'IMD trend', ranked: 'lsoa11', within: 'area', boundaries: null, groups: 10 },
    ],
    [
      'County & UA deprivation deciles in England (IMD2019, 4/23 geography)',
      {
        release: 'IMD2019',
        ranked: 'county-ua',
        within: 'england',
        boundaries: '2023',
        groups: 10,
      },
    ],
    [
      'County & UA deprivation deciles in England (IMD2019, 4/19 and 4/20 geog.)',
      {
        release: 'IMD2019',
        ranked: 'county-ua',
        within: 'england',
        boundaries: '2019-2020',
        groups: 10,
      },
    ],
    [
      'District & UA deprivation deciles in England (IMD2015, pre 4/19 geog.)',
      {
        release: 'IMD2015',
        ranked: 'district-ua',
        within: 'england',
        boundaries: 'pre-2019',
        groups: 10,
      },
    ],
    [
      'CCG deprivation deciles in England (IMD2019, 2021 CCGs)',
      { release: 'IMD2019', ranked: 'ccg', within: 'england', boundaries: '2021', groups: 10 },
    ],
  ])('parses %s', (name, scheme) => {
    expect(deprivationSchemeOf({ id: 'x', name, granularity: null })).toEqual(scheme);
  });

  it.each([
    'Decile boundaries',
    'IMD2010 - Employment domain',
    'LSOA11 deprivation quintiles within area - bottom- middle 3 - top (IMD2010)',
  ])('leaves %s as a custom dimension', (name) => {
    expect(deprivationSchemeOf({ id: 'x', name, granularity: null })).toBeUndefined();
  });
});

describe('deprivationGroupOf', () => {
  it.each([
    ['Most deprived decile (IMD2019)', 10, 1],
    ['Fifth more deprived decile', 10, 5],
    ['Fifth less deprived decile', 10, 6],
    ['Fith less deprived', 10, 6],
    ['Least deprived decile (IMD2015, 4/23 geo)', 10, 10],
    ['Average deprived quintile', 5, 3],
    ['Second least deprived quintile', 5, 4],
  ] as const)('puts %s in group %i of %i', (name, groups, group) => {
    expect(deprivationGroupOf(name, groups)).toBe(group);
  });

  it('refuses a name it cannot place', () => {
    expect(() => deprivationGroupOf('Deprivation quintiles 2,3,4', 5)).toThrow(/Unrecognised/);
  });
});

describe('publicDimensions', () => {
  const sex = { id: 'sex', name: 'Sex', granularity: null };
  const age = { id: 'age', name: 'Age', granularity: null };
  const tenure = { id: 'tenure', name: 'Tenure [23]', granularity: null };
  const value = (
    id: string,
    dimensionTypeId: string,
    name: string,
    code: string | null,
    isAggregate = false,
  ): DimensionValueInput => ({ id, dimensionTypeId, name, code, sortOrder: 0, isAggregate });

  it('names sex m and f, and leaves out the values no data uses', () => {
    const result = publicDimensions(
      [sex],
      [
        value('male', 'sex', 'Male', '1'),
        value('female', 'sex', 'Female', '2'),
        value('unknown', 'sex', 'Not known', '0'),
      ],
      new Map(),
    );

    expect(result.types).toEqual([{ id: 'sex', standardDimension: 'sex', slug: null }]);
    expect(result.values.map(({ id, slug }) => [id, slug])).toEqual([
      ['male', 'm'],
      ['female', 'f'],
    ]);
  });

  it('gives age bands HL7 ranges, with no upper limit for a band ending at 150', () => {
    const result = publicDimensions(
      [age],
      [
        value('all', 'age', 'All ages', '1', true),
        value('under5', 'age', '0-4 yrs', '28'),
        value('over65', 'age', '65+ yrs', '27'),
        value('neonatal', 'age', '<28 days', '23'),
        value('review', 'age', '2-2.5 yrs', '241'),
        value('school', 'age', 'School age', '217'),
      ],
      new Map([
        ['28', { min: 0, max: 4 }],
        ['27', { min: 65, max: 150 }],
      ]),
    );

    expect(
      result.values.map((v) => [
        v.slug,
        v.ageFromValue,
        v.ageFromUnit,
        v.ageUnderValue,
        v.ageUnderUnit,
      ]),
    ).toEqual([
      ['0-4', 0, 'year', 5, 'year'],
      ['65-plus', 65, 'year', null, null],
      ['u28-days', 0, 'day', 28, 'day'],
      ['2-to-2-and-a-half', 2, 'year', 30, 'month'],
      ['school-age', null, null, null, null],
    ]);
  });

  it('numbers deprivation values and records the scheme', () => {
    const type = {
      id: 'imd',
      name: 'LSOA21 deprivation quintiles in England (IMD2019)',
      granularity: 'quintiles',
    };
    const result = publicDimensions(
      [type],
      [value('q1', 'imd', 'Most deprived quintile', '1')],
      new Map(),
    );

    expect(result.types).toEqual([
      { id: 'imd', standardDimension: 'deprivation', slug: 'imd2019-lsoa21-england' },
    ]);
    expect(result.values[0]).toMatchObject({ slug: '1', deprivationGroup: 1 });
    expect(result.deprivationSchemes).toEqual([
      {
        id: 'imd',
        release: 'IMD2019',
        ranked: 'lsoa21',
        within: 'england',
        boundaries: null,
        groups: 5,
      },
    ]);
  });

  it('names a duplicated custom dimension from the hand-written table', () => {
    const result = publicDimensions([tenure], [], new Map());

    expect(result.types).toEqual([{ id: 'tenure', standardDimension: null, slug: 'tenure-4' }]);
  });

  it('refuses two values of one type that would share a slug', () => {
    expect(() =>
      publicDimensions(
        [tenure],
        [value('a', 'tenure', 'Owner occupied', '1'), value('b', 'tenure', 'Owner-occupied', '2')],
        new Map(),
      ),
    ).toThrow(/share the slug owner-occupied/);
  });
});
