import type { PeriodType, YearType } from '@fphd/utils/period-type';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from './client.ts';
import {
  getPublishedIndicatorById,
  type IndicatorSearchFilters,
  listIndicatorFacets,
  resolvePublishedIndicatorId,
  searchIndicators,
} from './indicator-repository.ts';
import { createTestDb, type TestDb } from './testing.ts';

// Seeded indicators given the period types the seed does not carry.
const WINTER_YEARS = 108;
const SURVEY_YEARS = 241;
const MONTHLY = 93995;
const MARCH_YEARS = 40501;
const LEAP_MARCH_YEARS = 90851;
// Seeded as financial and academic years.
const FINANCIAL_YEARS = [93622, 94194];
const ACADEMIC_YEARS = [92026, 92033];
// Seeded as calendar years, given the end dates of the named year types.
const ENDING_31_MARCH = 92443;
const ENDING_31_DECEMBER = 92708;
const ENDING_31_AUGUST = 93861;

let testDb: TestDb;
let owner: postgres.Sql;
let db: Database;

async function setPeriodType(
  shortId: number,
  periodType: PeriodType,
  yearType: YearType | null,
  yearEnd: [number, number] | null = null,
): Promise<void> {
  await owner`
    UPDATE indicator_version v
    SET period_type = ${periodType}, year_type = ${yearType},
        year_end_day = ${yearEnd?.[0] ?? null}, year_end_month = ${yearEnd?.[1] ?? null}
    FROM indicator i
    WHERE i.id = v.indicator_id AND i.short_id = ${shortId}
  `;
}

function filters(yearTypes: string[]): IndicatorSearchFilters {
  return {
    query: '',
    topics: [],
    indicatorTypes: [],
    lifeStages: [],
    frameworks: [],
    populations: [],
    inequalities: [],
    displayGroups: [],
    areaCodes: [],
    sources: [],
    valueTypes: [],
    yearTypes,
    limit: 200,
  };
}

async function shortIdsFound(yearTypes: string[]): Promise<number[]> {
  const { indicators } = await searchIndicators(db, filters(yearTypes));
  return indicators.map(({ shortId }) => shortId).sort((a, b) => a - b);
}

beforeAll(async () => {
  testDb = await createTestDb({ template: 'seeded' });
  owner = testDb.sql;
  db = testDb.db;

  await setPeriodType(WINTER_YEARS, 'years', 'specified-end-date', [31, 7]);
  await setPeriodType(SURVEY_YEARS, 'quarters', 'specified-end-date', [15, 11]);
  await setPeriodType(MONTHLY, 'months', null);
  await setPeriodType(MARCH_YEARS, 'years', 'specified-end-date', [28, 2]);
  await setPeriodType(LEAP_MARCH_YEARS, 'years', 'specified-end-date', [29, 2]);
  await setPeriodType(ENDING_31_MARCH, 'years', 'specified-end-date', [31, 3]);
  await setPeriodType(ENDING_31_DECEMBER, 'years', 'specified-end-date', [31, 12]);
  await setPeriodType(ENDING_31_AUGUST, 'years', 'specified-end-date', [31, 8]);
});

afterAll(async () => {
  await testDb.drop();
});

describe('the public year type', () => {
  it('names the months of a year ending on the last day of one', async () => {
    const id = await resolvePublishedIndicatorId(db, WINTER_YEARS);

    expect((await getPublishedIndicatorById(db, id ?? ''))?.yearType).toEqual({
      value: 'specified-end-date',
      label: 'August to July',
    });
  });

  it('names the date of a year ending within a month', async () => {
    const id = await resolvePublishedIndicatorId(db, SURVEY_YEARS);

    expect((await getPublishedIndicatorById(db, id ?? ''))?.yearType?.label).toBe(
      'Year ending 15 November',
    );
  });

  it.each([
    [ENDING_31_MARCH, 'financial', 'Financial'],
    [ENDING_31_DECEMBER, 'calendar', 'Calendar'],
    [ENDING_31_AUGUST, 'academic', 'Academic'],
  ])(
    'is the named year type a year ending on its last day is (%i)',
    async (shortId, value, label) => {
      const id = await resolvePublishedIndicatorId(db, shortId);

      expect((await getPublishedIndicatorById(db, id ?? ''))?.yearType).toEqual({ value, label });
    },
  );

  it('is null for an indicator of months, which is still published', async () => {
    const id = await resolvePublishedIndicatorId(db, MONTHLY);
    const indicator = await getPublishedIndicatorById(db, id ?? '');

    expect(indicator?.shortId).toBe(MONTHLY);
    expect(indicator?.yearType).toBeNull();
  });

  it('offers each label once, in order, as a search filter', async () => {
    expect((await listIndicatorFacets(db)).yearTypes).toEqual([
      'Academic',
      'August to July',
      'Calendar',
      'Financial',
      'March to February',
      'Year ending 15 November',
    ]);
  });

  it('finds the indicators a label names', async () => {
    expect(await shortIdsFound(['August to July'])).toEqual([WINTER_YEARS]);
    expect(await shortIdsFound(['August to July', 'Year ending 15 November'])).toEqual([
      WINTER_YEARS,
      SURVEY_YEARS,
    ]);
    expect(await shortIdsFound(['Calendar'])).not.toContain(MONTHLY);
  });

  it('finds a named year type and the years ending on its last day by its name', async () => {
    expect(await shortIdsFound(['Financial'])).toEqual([ENDING_31_MARCH, ...FINANCIAL_YEARS]);
    expect(await shortIdsFound(['Academic'])).toEqual([...ACADEMIC_YEARS, ENDING_31_AUGUST]);
    expect(await shortIdsFound(['Calendar'])).toContain(ENDING_31_DECEMBER);
  });

  it('reads the months a named year type runs between as that year type', async () => {
    expect(await shortIdsFound(['April to March'])).toEqual(await shortIdsFound(['Financial']));
  });

  it('finds years ending 28 and 29 February by the one label', async () => {
    expect(await shortIdsFound(['March to February'])).toEqual([MARCH_YEARS, LEAP_MARCH_YEARS]);
  });

  it('finds nothing for a label no indicator has', async () => {
    expect(await shortIdsFound(['November-November'])).toEqual([]);
  });
});
