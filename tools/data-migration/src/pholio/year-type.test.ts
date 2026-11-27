import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  type FingertipsPeriod,
  timePeriodColumns,
  YEAR_TYPES,
  yearTypeValues,
} from './year-type.ts';

const migrationDir = new URL('../../../../packages/db-operations/drizzle/', import.meta.url);

function yearly(year: number, yearRange = 1, series = 'persons'): FingertipsPeriod {
  return { series, year, yearRange, quarter: false, month: false };
}

const QUARTER: FingertipsPeriod = {
  series: 'persons',
  year: 2020,
  yearRange: 1,
  quarter: true,
  month: false,
};
const MONTH: FingertipsPeriod = { ...QUARTER, quarter: false, month: true };

describe('yearTypeValues', () => {
  it('has the 17 Fingertips year types', () => {
    expect(Object.keys(YEAR_TYPES)).toHaveLength(17);
  });

  it('names the same Fingertips year types as the migration that first translated them', () => {
    const sql = readFileSync(new URL('0034_period-type.sql', migrationDir), 'utf8');
    for (const name of Object.keys(YEAR_TYPES)) expect(sql).toContain(`'${name}'`);
  });

  it('throws for an unrecognised year type name', () => {
    expect(() => yearTypeValues('Fortnightly')).toThrow('Fortnightly');
  });
});

describe('timePeriodColumns', () => {
  it('reads a year type alone as single years of it', () => {
    expect(timePeriodColumns('Financial', [])).toMatchObject({
      time_periods: '{single-years}',
      year_type: 'financial',
      year_end_day: null,
      multiple_years_count: null,
      periods_rolling: false,
      rolling_frequency: null,
      values_cumulative: false,
    });
  });

  it('gives a year ending on a specified date its day and month', () => {
    expect(timePeriodColumns('August-July', [])).toMatchObject({
      year_type: 'specified-end-date',
      year_end_day: 31,
      year_end_month: 7,
    });
  });

  it('reads a year ending at a point as years ending that day', () => {
    expect(timePeriodColumns('Financial year end point', [yearly(2020)])).toMatchObject({
      time_periods: '{single-years}',
      year_type: 'specified-end-date',
      year_end_day: 31,
      year_end_month: 3,
    });
  });

  it.each([
    ['September-January', 31, 1],
    ['September-February', 28, 2],
  ])('reads %s as a date range from 1 September', (name, endDay, endMonth) => {
    expect(timePeriodColumns(name, [yearly(2020)])).toMatchObject({
      time_periods: '{date-range}',
      year_type: null,
      date_range_start_day: 1,
      date_range_start_month: 9,
      date_range_end_day: endDay,
      date_range_end_month: endMonth,
    });
  });

  it.each([
    ['Calendar rolling year - monthly', 'calendar', 'months', MONTH],
    ['Calendar rolling year - quarterly', 'calendar', 'quarters', QUARTER],
    ['Financial rolling year - monthly', 'financial', 'months', MONTH],
    ['Financial rolling year - quarterly', 'financial', 'quarters', QUARTER],
  ] as const)('reads %s as single years rolling on', (name, yearType, frequency, row) => {
    expect(timePeriodColumns(name, [row])).toMatchObject({
      time_periods: '{single-years}',
      year_type: yearType,
      periods_rolling: true,
      rolling_frequency: frequency,
    });
  });

  it.each([
    'Financial single year cumulative quarters',
    'Financial multi year cumulative quarters',
  ])('reads %s as cumulative quarters, beside their financial years', (name) => {
    expect(timePeriodColumns(name, [QUARTER, yearly(2020)])).toMatchObject({
      time_periods: '{single-years,quarters}',
      year_type: 'financial',
      values_cumulative: true,
      periods_rolling: false,
    });
  });

  it('reads quarters and months of the data as quarters and months, with no year type', () => {
    expect(timePeriodColumns('Calendar', [QUARTER, MONTH])).toMatchObject({
      time_periods: '{quarters,months}',
      year_type: null,
    });
  });

  it('reads periods of several years as periods of more than 1 year of their year type', () => {
    expect(timePeriodColumns('Academic', [yearly(2015, 5), yearly(2020, 5)])).toMatchObject({
      time_periods: '{multiple-years}',
      multiple_years_count: 5,
      multiple_years_year_type: 'academic',
      year_type: null,
      periods_rolling: false,
    });
  });

  it('rolls periods of more than 1 year on by the year when consecutive ones overlap', () => {
    expect(
      timePeriodColumns('Calendar', [yearly(2016, 3), yearly(2017, 3), yearly(2018)]),
    ).toMatchObject({
      time_periods: '{multiple-years,single-years}',
      multiple_years_count: 3,
      year_type: 'calendar',
      periods_rolling: true,
      rolling_frequency: 'years',
    });
  });

  it('takes the shortest of several lengths of period of more than 1 year', () => {
    expect(timePeriodColumns('Calendar', [yearly(2015, 5), yearly(2017, 3)])).toMatchObject({
      multiple_years_count: 3,
    });
  });

  it('rolls on by the year only where periods of the length taken overlap', () => {
    expect(
      timePeriodColumns('Calendar', [
        yearly(2011, 3),
        yearly(2014, 3),
        yearly(2010, 5),
        yearly(2011, 5),
      ]),
    ).toMatchObject({ multiple_years_count: 3, periods_rolling: false, rolling_frequency: null });
  });

  it('judges overlap within each series, not across them', () => {
    expect(
      timePeriodColumns('Calendar', [
        yearly(2011, 3, 'persons'),
        yearly(2014, 3, 'persons'),
        yearly(2012, 3, 'males'),
        yearly(2015, 3, 'males'),
      ]),
    ).toMatchObject({ periods_rolling: false, rolling_frequency: null });
    expect(
      timePeriodColumns('Calendar', [
        yearly(2011, 3, 'persons'),
        yearly(2014, 3, 'persons'),
        yearly(2012, 3, 'males'),
        yearly(2013, 3, 'males'),
      ]),
    ).toMatchObject({ periods_rolling: true, rolling_frequency: 'years' });
  });
});
