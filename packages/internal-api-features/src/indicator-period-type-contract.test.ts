import { describe, expect, it } from 'vitest';

import { periodTypeSection as section } from './indicator-period-type-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const unanswered = {
  periodType: '',
  yearType: '',
  yearEndDay: '',
  yearEndMonth: '',
  publishedFrom: '',
};

const years = (yearType: string, yearEndDay = '', yearEndMonth = '') => ({
  publishedFrom: '',
  periodType: 'years',
  yearType,
  yearEndDay,
  yearEndMonth,
});

const endingOn = (day: string, month: string) => years('specified-end-date', day, month);

const REAL_DATE = 'Date must be a real date';

describe('periodTypeSection', () => {
  it('asks for the period type first', () => {
    expect(sectionFieldErrors(section, unanswered)).toEqual({
      periodType: 'Select the period type',
    });
  });

  it('refuses a period type it does not offer', () => {
    expect(sectionFieldErrors(section, { ...unanswered, periodType: 'weeks' })).toEqual({
      periodType: 'Select the period type',
    });
  });

  it('takes months with nothing more', () => {
    expect(sectionFieldErrors(section, { ...unanswered, periodType: 'months' })).toBeUndefined();
  });

  it.each([
    ['years', 'years'],
    ['quarters', 'quarters'],
  ])('asks %s for the year type', (_, periodType) => {
    expect(sectionFieldErrors(section, { ...unanswered, periodType })).toEqual({
      yearType: 'Select the year type',
    });
    expect(
      sectionFieldErrors(section, { ...unanswered, periodType, yearType: 'not-a-year-type' }),
    ).toEqual({ yearType: 'Select the year type' });
  });

  it.each(['calendar', 'financial', 'academic', 'rolling'])(
    'takes a %s year with no date',
    (yearType) => {
      expect(sectionFieldErrors(section, years(yearType))).toBeUndefined();
    },
  );

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
    ['30 February', endingOn('30', '2'), { yearEndDay: REAL_DATE }],
    ['31 April', endingOn('31', '4'), { yearEndDay: REAL_DATE }],
  ])('refuses %s', (_, body, errors) => {
    expect(sectionFieldErrors(section, body)).toEqual(errors);
  });

  it('takes a year type of quarters ending on a date', () => {
    expect(
      sectionFieldErrors(section, {
        publishedFrom: '',
        periodType: 'quarters',
        yearType: 'specified-end-date',
        yearEndDay: '30',
        yearEndMonth: '9',
      }),
    ).toBeUndefined();
  });

  it('checks no date for a year type that does not ask for one', () => {
    expect(sectionFieldErrors(section, years('calendar', 'last', 'July'))).toBeUndefined();
  });
});

it.each(['2023-02-29', '2024-04-31', '2024-13-01', '1 February 2024', '2024-2-01'])(
  'refuses an invalid publication start date %s',
  (publishedFrom) => {
    expect(sectionFieldErrors(section, { ...years('calendar'), publishedFrom })).toEqual({
      publishedFrom: 'Enter a real date in the format YYYY-MM-DD',
    });
  },
);

it.each(['', '2024-02-29'])('accepts an optional publication start date %s', (publishedFrom) => {
  expect(section.schema.parse({ ...years('calendar'), publishedFrom })).toMatchObject({
    publishedFrom,
  });
});
