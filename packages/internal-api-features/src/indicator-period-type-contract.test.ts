import { describe, expect, it } from 'vitest';

import { periodTypeSection as section } from './indicator-period-type-contract.ts';
import { periodTypeAnswers } from './period-type.testing.ts';
import { sectionFieldErrors } from './testing.ts';

const SELECT_TIME_PERIODS = 'Select the time periods included in this indicator';
const REAL_DATE = 'Date must be a real date';

const unanswered = periodTypeAnswers({
  timePeriods: [],
  yearType: '',
  periodsRolling: '',
  valuesCumulative: '',
} as never);

const singleYears = (yearType: string, yearEndDay = '', yearEndMonth = '') =>
  periodTypeAnswers({ timePeriods: ['single-years'], yearType, yearEndDay, yearEndMonth });

const endingOn = (day: string, month: string) => singleYears('specified-end-date', day, month);

const multipleYears = (answers: object) =>
  periodTypeAnswers({
    timePeriods: ['multiple-years'],
    yearType: '',
    multipleYearsCount: '3',
    multipleYearsYearType: 'calendar',
    ...answers,
  });

const dateRange = (start: [string, string], end: [string, string]) =>
  periodTypeAnswers({
    timePeriods: ['date-range'],
    yearType: '',
    dateRangeStartDay: start[0],
    dateRangeStartMonth: start[1],
    dateRangeEndDay: end[0],
    dateRangeEndMonth: end[1],
  });

describe('periodTypeSection', () => {
  it('asks every question at once', () => {
    expect(sectionFieldErrors(section, unanswered)).toEqual({
      timePeriods: SELECT_TIME_PERIODS,
      periodsRolling: 'Select whether time periods are rolling',
      valuesCumulative: 'Select whether values are cumulative across time periods',
    });
  });

  it('refuses a kind of time period it does not offer', () => {
    expect(sectionFieldErrors(section, { ...unanswered, timePeriods: ['weeks'] })).toMatchObject({
      timePeriods: SELECT_TIME_PERIODS,
    });
  });

  it('keeps the kinds ticked in the order the page lists them, once each', () => {
    expect(
      section.schema.parse(
        periodTypeAnswers({ timePeriods: ['months', 'quarters', 'months'], yearType: '' }),
      ).timePeriods,
    ).toEqual(['quarters', 'months']);
  });

  it('takes quarters and months with nothing more', () => {
    expect(
      sectionFieldErrors(
        section,
        periodTypeAnswers({ timePeriods: ['quarters', 'months'], yearType: '' }),
      ),
    ).toBeUndefined();
  });

  it('asks single years for the year type', () => {
    expect(sectionFieldErrors(section, singleYears(''))).toEqual({
      yearType: 'Select the year type',
    });
    expect(sectionFieldErrors(section, singleYears('rolling'))).toEqual({
      yearType: 'Select the year type',
    });
  });

  it.each(['calendar', 'financial', 'academic'])('takes %s years with no date', (yearType) => {
    expect(sectionFieldErrors(section, singleYears(yearType))).toBeUndefined();
  });

  it.each([
    ['the last day of a month', '31', '7'],
    ['the last day of February in a leap year', '29', '2'],
    ['leading zeros', '01', '09'],
  ])('takes a year ending on %s', (_, day, month) => {
    expect(sectionFieldErrors(section, endingOn(day, month))).toBeUndefined();
  });

  it('keeps the answers as text, trimmed', () => {
    expect(section.schema.parse(endingOn(' 31 ', ' 7 '))).toEqual(endingOn('31', '7'));
  });

  it('asks for the date on both of its parts when none is given', () => {
    expect(sectionFieldErrors(section, endingOn('', ' '))).toEqual({
      yearEndDay: 'Enter the date',
      yearEndMonth: 'Enter the date',
    });
  });

  it.each([
    [endingOn('', '7'), { yearEndDay: 'Date must include a day' }],
    [endingOn('31', ''), { yearEndMonth: 'Date must include a month' }],
  ])('names the part of the date that is missing', (body, errors) => {
    expect(sectionFieldErrors(section, body)).toEqual(errors);
  });

  it.each([
    ['a day past the end of any month', endingOn('32', '1'), { yearEndDay: REAL_DATE }],
    ['day 0', endingOn('0', '1'), { yearEndDay: REAL_DATE }],
    ['month 13', endingOn('1', '13'), { yearEndMonth: REAL_DATE }],
    ['words', endingOn('last', 'July'), { yearEndDay: REAL_DATE, yearEndMonth: REAL_DATE }],
    ['a fraction', endingOn('1.5', '1'), { yearEndDay: REAL_DATE }],
    ['31 February', endingOn('31', '2'), { yearEndDay: REAL_DATE }],
    ['31 April', endingOn('31', '4'), { yearEndDay: REAL_DATE }],
  ])('refuses %s', (_, body, errors) => {
    expect(sectionFieldErrors(section, body)).toEqual(errors);
  });

  it('checks no date for a year type that does not ask for one', () => {
    expect(sectionFieldErrors(section, singleYears('calendar', 'last', 'July'))).toBeUndefined();
  });

  describe('periods of more than 1 year', () => {
    it('take a number of years from 2 to 99 and a year type', () => {
      expect(sectionFieldErrors(section, multipleYears({}))).toBeUndefined();
      expect(sectionFieldErrors(section, multipleYears({ multipleYearsCount: '99' }))).toBe(
        undefined,
      );
    });

    it.each([
      ['', 'Enter the number of years'],
      ['three', 'Number of years must be 1 or 2 digits'],
      ['100', 'Number of years must be 1 or 2 digits'],
      ['2.5', 'Number of years must be 1 or 2 digits'],
      ['0', 'Number of years must be 2 or more'],
      ['1', 'Number of years must be 2 or more'],
    ])('refuses %j years', (multipleYearsCount, message) => {
      expect(sectionFieldErrors(section, multipleYears({ multipleYearsCount }))).toEqual({
        multipleYearsCount: message,
      });
    });

    it('ask for their own year type and its date', () => {
      expect(sectionFieldErrors(section, multipleYears({ multipleYearsYearType: '' }))).toEqual({
        multipleYearsYearType: 'Select the year type',
      });
      expect(
        sectionFieldErrors(
          section,
          multipleYears({ multipleYearsYearType: 'specified-end-date', multipleYearsEndDay: '31' }),
        ),
      ).toEqual({ multipleYearsEndMonth: 'Date must include a month' });
    });

    it('may be ticked beside single years of another year type', () => {
      expect(
        sectionFieldErrors(
          section,
          multipleYears({ timePeriods: ['multiple-years', 'single-years'], yearType: 'financial' }),
        ),
      ).toBeUndefined();
    });
  });

  describe('a specific date range', () => {
    it('takes a window that crosses the new year', () => {
      expect(sectionFieldErrors(section, dateRange(['1', '10'], ['31', '3']))).toBeUndefined();
    });

    it('asks for each of its dates', () => {
      expect(sectionFieldErrors(section, dateRange(['', ''], ['', '']))).toEqual({
        dateRangeStartDay: 'Enter the start date',
        dateRangeStartMonth: 'Enter the start date',
        dateRangeEndDay: 'Enter the end date',
        dateRangeEndMonth: 'Enter the end date',
      });
    });

    it('refuses a date no year has', () => {
      expect(sectionFieldErrors(section, dateRange(['1', '9'], ['30', '2']))).toEqual({
        dateRangeEndDay: REAL_DATE,
      });
    });
  });

  it('asks rolling time periods for their frequency', () => {
    expect(sectionFieldErrors(section, periodTypeAnswers({ periodsRolling: 'yes' }))).toEqual({
      rollingFrequency: 'Select the rolling frequency',
    });
    expect(
      sectionFieldErrors(
        section,
        periodTypeAnswers({ periodsRolling: 'yes', rollingFrequency: 'weeks' }),
      ),
    ).toEqual({ rollingFrequency: 'Select the rolling frequency' });
    expect(
      sectionFieldErrors(
        section,
        periodTypeAnswers({ periodsRolling: 'yes', rollingFrequency: 'quarters' }),
      ),
    ).toBeUndefined();
  });

  it('asks nothing of the kinds not ticked', () => {
    expect(
      sectionFieldErrors(
        section,
        periodTypeAnswers({
          timePeriods: ['months'],
          yearType: 'not a year type',
          multipleYearsCount: '1',
          dateRangeStartDay: '40',
          rollingFrequency: 'weeks',
        }),
      ),
    ).toBeUndefined();
  });
});

it.each(['2023-02-29', '2024-04-31', '2024-13-01', '1 February 2024', '2024-2-01'])(
  'refuses an invalid publication start date %s',
  (publishedFrom) => {
    expect(sectionFieldErrors(section, periodTypeAnswers({ publishedFrom }))).toEqual({
      publishedFrom: 'Enter a real date in the format YYYY-MM-DD',
    });
  },
);

it.each(['', '2024-02-29'])('accepts an optional publication start date %s', (publishedFrom) => {
  expect(section.schema.parse(periodTypeAnswers({ publishedFrom }))).toMatchObject({
    publishedFrom,
  });
});
