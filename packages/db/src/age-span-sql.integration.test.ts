import { ISO_AGE_DURATION } from '@fphd/utils/age-range';
import { headlineSeries } from '@fphd/utils/observation-series';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { widestAgeFirst } from './age-span-sql.ts';
import { dimensionType, dimensionValue, dimensionValueAgeRange } from './schema/index.ts';
import { createTestDb, type TestDb } from './testing.ts';

interface Age {
  name: string;
  /** From and under, as ISO 8601 durations, or null for an age with no range. */
  range: [string, string | null] | null;
}

const age = (name: string, from?: string, under?: string): Age => ({
  name,
  range: from === undefined ? null : [from, under ?? null],
});

// The TypeScript rule and the SQL rule both choose the first age of each case.
const cases: [string, Age, Age][] = [
  [
    'the whole group over a band in it',
    age('18-74 yrs', 'P18Y', 'P75Y'),
    age('70-74 yrs', 'P70Y', 'P75Y'),
  ],
  ['no upper limit over a band', age('16+ yrs', 'P16Y'), age('35-44 yrs', 'P35Y', 'P45Y')],
  ['the earlier start with no upper limit', age('16+ yrs', 'P16Y'), age('85+ yrs', 'P85Y')],
  [
    'a wider band starting at the same age',
    age('0-4 yrs', 'P0Y', 'P5Y'),
    age('<1 yr', 'P0Y', 'P1Y'),
  ],
  [
    'a range in months over one in years',
    age('6 months-64 yrs', 'P6M', 'P65Y'),
    age('0-4 yrs', 'P0Y', 'P5Y'),
  ],
  ['a range over an age with none', age('<1 yr', 'P0Y', 'P1Y'), age('Primary school age')],
];

const UNITS = { Y: 'year', M: 'month', W: 'week', D: 'day' } as const;

function parse(duration: string) {
  const [, value, designator] = ISO_AGE_DURATION.exec(duration) ?? [];
  return { value: Number(value), unit: UNITS[designator as keyof typeof UNITS] };
}

let database: TestDb;
const ids = new Map<string, string>();

function idOf(name: string): string {
  const id = ids.get(name);
  if (id === undefined) throw new Error(`No dimension value fixture for ${name}`);
  return id;
}

beforeAll(async () => {
  database = await createTestDb();
  const [type] = await database.db
    .insert(dimensionType)
    .values({ name: 'Age', dimensionClass: 'core' })
    .returning();
  if (!type) throw new Error('Age type fixture missing');
  const ages = [...new Map(cases.flatMap(([, ...pair]) => pair).map((a) => [a.name, a])).values()];
  const values = await database.db
    .insert(dimensionValue)
    .values(ages.map(({ name }) => ({ dimensionTypeId: type.id, name })))
    .returning();
  for (const { id, name } of values) ids.set(name, id);
  await database.db.insert(dimensionValueAgeRange).values(
    ages.flatMap(({ name, range }) => {
      if (!range) return [];
      const from = parse(range[0]);
      const under = range[1] ? parse(range[1]) : null;
      return [
        {
          id: idOf(name),
          ageFromValue: from.value,
          ageFromUnit: from.unit,
          ageUnderValue: under?.value ?? null,
          ageUnderUnit: under?.unit ?? null,
        },
      ];
    }),
  );
});

afterAll(async () => {
  await database.drop();
});

/** A series of the given length, ending in 2024. */
function observations(age: Age, years: number) {
  return Array.from({ length: years }, (_, index) => ({
    fromDate: `${2025 - years + index}-01-01`,
    toDate: `${2025 - years + index}-12-31`,
    value: 1,
    dimensions: [
      {
        type: 'Age',
        value: age.name,
        ...(age.range ? { ageFrom: age.range[0] } : {}),
        ...(age.range?.[1] ? { ageUnder: age.range[1] } : {}),
      },
    ],
  }));
}

it.each(cases)('chooses %s in TypeScript, even with fewer points', (_, wider, narrower) => {
  const series = headlineSeries([...observations(narrower, 3), ...observations(wider, 2)]);
  expect(series.map(({ dimensions }) => dimensions[0]?.value)).toEqual([wider.name, wider.name]);
});

it.each(cases)('chooses %s in SQL', async (_, wider, narrower) => {
  const keys = [narrower, wider].map(({ name }) => sql`(${idOf(name)})`);
  const [first] = await database.db.execute<{ key: string }>(sql`
    SELECT key FROM (VALUES ${sql.join(keys, sql`, `)}) segment(key)
    ORDER BY ${widestAgeFirst(sql`key`, dimensionValueAgeRange)}
    LIMIT 1
  `);
  expect(first?.key).toBe(idOf(wider.name));
});

it('falls through to the most points when two ages are as wide', () => {
  const series = headlineSeries([
    ...observations(age('0-4 yrs', 'P0Y', 'P5Y'), 2),
    ...observations(age('5-9 yrs', 'P5Y', 'P10Y'), 3),
  ]);
  expect(series.map(({ dimensions }) => dimensions[0]?.value)).toEqual(Array(3).fill('5-9 yrs'));
});

it('chooses the series with the newest value, even with more dimensions', () => {
  const older = Array.from({ length: 5 }, (_, index) => ({
    fromDate: `${2019 + index}-01-01`,
    toDate: `${2019 + index}-12-31`,
    value: 1,
    dimensions: [],
  }));
  const newer = observations(age('12+ yrs', 'P12Y'), 2);
  expect(headlineSeries([...older, ...newer])).toEqual(newer);
  const suppressed = newer.map((point) => ({ ...point, value: null }));
  expect(headlineSeries([...older, ...suppressed])).toEqual(older);
});

it('keeps the total over a newer breakdown by a dimension other than age', () => {
  const total = observations(age('All ages'), 2).map((point) => ({ ...point, dimensions: [] }));
  const breakdown = Array.from({ length: 2 }, (_, index) => ({
    fromDate: `${2024 + index}-01-01`,
    toDate: `${2024 + index}-12-31`,
    value: 1,
    dimensions: [{ type: 'Deprivation', value: 'Most deprived decile' }],
  }));
  expect(headlineSeries([...breakdown, ...total])).toEqual(total);
});

it('breaks a full tie by the earliest first point, whatever the input order', () => {
  const earlier = observations(age('0-4 yrs', 'P0Y', 'P5Y'), 2).map((point, index) => ({
    ...point,
    fromDate: index === 0 ? '2022-06-01' : point.fromDate,
  }));
  const later = observations(age('5-9 yrs', 'P5Y', 'P10Y'), 2);
  expect(headlineSeries([...later, ...earlier])).toEqual(earlier);
  expect(headlineSeries([...earlier, ...later])).toEqual(earlier);
});
