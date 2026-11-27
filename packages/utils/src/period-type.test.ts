import { describe, expect, it } from 'vitest';

import {
  isDayOfMonth,
  publicYearType,
  shownYearType,
  type TimePeriodAnswers,
  timePeriodsText,
  yearTypeValuesLabelled,
} from './period-type.ts';

describe('isDayOfMonth', () => {
  it.each([
    [31, 1],
    [29, 2],
    [30, 4],
    [31, 12],
    [1, 1],
  ])('accepts %i of month %i', (day, month) => {
    expect(isDayOfMonth(day, month)).toBe(true);
  });

  it.each([
    [30, 2],
    [31, 4],
    [31, 11],
    [0, 1],
    [32, 1],
    [1, 0],
    [1, 13],
    [1.5, 1],
  ])('refuses %d of month %d', (day, month) => {
    expect(isDayOfMonth(day, month)).toBe(false);
  });

  it('accepts 29 February only in a leap year when given the year', () => {
    expect(isDayOfMonth(29, 2, 2028)).toBe(true);
    expect(isDayOfMonth(29, 2, 2027)).toBe(false);
    expect(isDayOfMonth(29, 2, 2100)).toBe(false);
  });

  it.each([2028.5, -2028, 0, 99, 10000])('refuses a year of %s', (year) => {
    expect(isDayOfMonth(1, 1, year)).toBe(false);
  });
});

describe('publicYearType', () => {
  it.each([
    ['Calendar', 'calendar'],
    ['Financial', 'financial'],
    ['Academic', 'academic'],
    ['Rolling', 'rolling'],
  ] as const)('labels %s by its own name', (label, yearType) => {
    expect(publicYearType(yearType, null)).toEqual({ value: yearType, label });
  });

  it.each([
    [31, 3, 'financial', 'Financial'],
    [31, 12, 'calendar', 'Calendar'],
    [31, 8, 'academic', 'Academic'],
  ] as const)(
    'is the named year type a year ending %i/%i ends with',
    (day, month, value, label) => {
      expect(publicYearType('specified-end-date', { day, month })).toEqual({ value, label });
    },
  );

  it.each([
    [31, 7, 'August to July'],
    [30, 6, 'July to June'],
    [30, 9, 'October to September'],
    [31, 1, 'February to January'],
    [28, 2, 'March to February'],
    [29, 2, 'March to February'],
  ])(
    'names the months of a year ending on the last day of a month (%i/%i)',
    (day, month, label) => {
      expect(publicYearType('specified-end-date', { day, month })).toEqual({
        value: 'specified-end-date',
        label,
      });
    },
  );

  it.each([
    [15, 11, 'Year ending 15 November'],
    [30, 7, 'Year ending 30 July'],
    [30, 3, 'Year ending 30 March'],
    [1, 1, 'Year ending 1 January'],
  ])('names the date of a year ending within a month (%i/%i)', (day, month, label) => {
    expect(publicYearType('specified-end-date', { day, month }).label).toBe(label);
  });
});

describe('yearTypeValuesLabelled', () => {
  const endingOn = (day: number, month: number) => ({
    yearType: 'specified-end-date',
    yearEnd: { day, month },
  });

  it.each([
    ['Financial', 'financial', [31, 3]],
    ['Calendar', 'calendar', [31, 12]],
    ['Academic', 'academic', [31, 8]],
  ] as const)('finds %s and the year ending on its last day', (label, yearType, [day, month]) => {
    expect(yearTypeValuesLabelled(label)).toEqual([
      { yearType, yearEnd: null },
      endingOn(day, month),
    ]);
  });

  it.each([
    ['April to March', 'Financial'],
    ['January to December', 'Calendar'],
    ['September to August', 'Academic'],
  ])('reads %s as %s', (months, named) => {
    expect(yearTypeValuesLabelled(months)).toEqual(yearTypeValuesLabelled(named));
  });

  it('finds rolling years', () => {
    expect(yearTypeValuesLabelled('Rolling')).toEqual([{ yearType: 'rolling', yearEnd: null }]);
  });

  it('finds years ending 28 and 29 February by the one label', () => {
    expect(yearTypeValuesLabelled('March to February')).toEqual([endingOn(28, 2), endingOn(29, 2)]);
  });

  it('finds a year ending within a month by its date', () => {
    expect(yearTypeValuesLabelled('Year ending 15 November')).toEqual([endingOn(15, 11)]);
  });

  it.each(['Ending a specified date', 'November-November', 'Financial year end point', ''])(
    'finds nothing for %j, which no year is labelled',
    (label) => {
      expect(yearTypeValuesLabelled(label)).toEqual([]);
    },
  );
});

const noTimePeriods: TimePeriodAnswers = {
  timePeriods: null,
  multipleYearsCount: null,
  multipleYearsYearType: null,
  multipleYearsEndDay: null,
  multipleYearsEndMonth: null,
  yearType: null,
  yearEndDay: null,
  yearEndMonth: null,
  dateRangeStartDay: null,
  dateRangeStartMonth: null,
  dateRangeEndDay: null,
  dateRangeEndMonth: null,
  periodsRolling: null,
  rollingFrequency: null,
};

describe('shownYearType', () => {
  it("reads the single years' year type first", () => {
    expect(
      shownYearType({
        ...noTimePeriods,
        yearType: 'financial',
        multipleYearsYearType: 'calendar',
      }),
    ).toEqual({ value: 'financial', label: 'Financial' });
  });

  it('reads the year type of periods of more than 1 year where there are no single years', () => {
    expect(
      shownYearType({
        ...noTimePeriods,
        multipleYearsYearType: 'specified-end-date',
        multipleYearsEndDay: 31,
        multipleYearsEndMonth: 3,
      }),
    ).toEqual({ value: 'financial', label: 'Financial' });
  });

  it.each(['quarters', 'months'] as const)(
    'is rolling for periods rolling on by the %s',
    (frequency) => {
      expect(
        shownYearType({
          ...noTimePeriods,
          yearType: 'calendar',
          periodsRolling: true,
          rollingFrequency: frequency,
        }),
      ).toEqual({ value: 'rolling', label: 'Rolling' });
    },
  );

  it('keeps the year type of periods rolling on by the year, which start on one date each year', () => {
    expect(
      shownYearType({
        ...noTimePeriods,
        multipleYearsYearType: 'academic',
        periodsRolling: true,
        rollingFrequency: 'years',
      }),
    ).toEqual({ value: 'academic', label: 'Academic' });
  });

  it('is null for quarters, months and date ranges, which have no year type', () => {
    expect(shownYearType(noTimePeriods)).toBeNull();
  });
});

describe('timePeriodsText', () => {
  it('is null until the time periods are answered', () => {
    expect(timePeriodsText(noTimePeriods)).toBeNull();
  });

  it('words each kind of time period, in the order the page asks them, with its dates', () => {
    expect(
      timePeriodsText({
        ...noTimePeriods,
        timePeriods: ['date-range', 'months', 'quarters', 'single-years', 'multiple-years'],
        multipleYearsCount: 3,
        multipleYearsYearType: 'calendar',
        yearType: 'financial',
        dateRangeStartDay: 1,
        dateRangeStartMonth: 10,
        dateRangeEndDay: 31,
        dateRangeEndMonth: 3,
      }),
    ).toBe(
      '3-year Calendar years (1 January to 31 December), Financial years (1 April to 31 March), Quarters, Months, 1 October to 31 March',
    );
  });

  it('words years ending on a specified date by that date', () => {
    expect(
      timePeriodsText({
        ...noTimePeriods,
        timePeriods: ['multiple-years', 'single-years'],
        multipleYearsCount: 5,
        multipleYearsYearType: 'specified-end-date',
        multipleYearsEndDay: 15,
        multipleYearsEndMonth: 11,
        yearType: 'specified-end-date',
        yearEndDay: 31,
        yearEndMonth: 3,
      }),
    ).toBe('5-year years ending 15 November, Years ending 31 March');
  });
});
