import { describe, expect, it } from 'vitest';
import { computeDates, endOfMonth, yearTypeOnlyFromDate, yearTypeOnlyToDate } from './period.ts';

describe('endOfMonth', () => {
  it('returns Jan 31', () => expect(endOfMonth(2020, 1)).toBe('2020-01-31'));
  it('returns Feb 29 in a leap year', () => expect(endOfMonth(2020, 2)).toBe('2020-02-29'));
  it('returns Feb 28 in a non-leap year', () => expect(endOfMonth(2021, 2)).toBe('2021-02-28'));
  it('returns Mar 31', () => expect(endOfMonth(2020, 3)).toBe('2020-03-31'));
  it('returns Apr 30', () => expect(endOfMonth(2020, 4)).toBe('2020-04-30'));
  it('returns Dec 31', () => expect(endOfMonth(2020, 12)).toBe('2020-12-31'));
  it('returns Sep 30', () => expect(endOfMonth(2019, 9)).toBe('2019-09-30'));
});

describe('yearTypeOnlyFromDate', () => {
  it('YearTypeID=1 (Calendar) → Jan 1', () =>
    expect(yearTypeOnlyFromDate(2020, 1)).toBe('2020-01-01'));
  it('YearTypeID=2 (Financial) → Apr 1', () =>
    expect(yearTypeOnlyFromDate(2020, 2)).toBe('2020-04-01'));
  it('YearTypeID=3 (Academic) → Sep 1', () =>
    expect(yearTypeOnlyFromDate(2020, 3)).toBe('2020-09-01'));
  it('YearTypeID=8 (Aug-Jul) → Aug 1', () =>
    expect(yearTypeOnlyFromDate(2020, 8)).toBe('2020-08-01'));
  it('YearTypeID=9 (Mar-Feb) → Mar 1', () =>
    expect(yearTypeOnlyFromDate(2020, 9)).toBe('2020-03-01'));
  it('YearTypeID=10 (Financial multi-year) → Apr 1', () =>
    expect(yearTypeOnlyFromDate(2020, 10)).toBe('2020-04-01'));
  it('YearTypeID=11 (Oct-Sep) → Oct 1', () =>
    expect(yearTypeOnlyFromDate(2020, 11)).toBe('2020-10-01'));
  it('YearTypeID=13 (Jul-Jun) → Jul 1', () =>
    expect(yearTypeOnlyFromDate(2020, 13)).toBe('2020-07-01'));
  it('starts the Active Lives survey year on 16 November', () =>
    expect(yearTypeOnlyFromDate(2020, 14)).toBe('2020-11-16'));
  it('YearTypeID=17 (Sep-Jan) → Sep 1', () =>
    expect(yearTypeOnlyFromDate(2020, 17)).toBe('2020-09-01'));
  it('YearTypeID=18 (Sep-Feb) → Sep 1', () =>
    expect(yearTypeOnlyFromDate(2020, 18)).toBe('2020-09-01'));
  it('rejects a source year type the converter does not recognise', () =>
    expect(() => yearTypeOnlyFromDate(2020, 99)).toThrow('Unsupported source year type'));
});

describe('yearTypeOnlyToDate', () => {
  it('uses one financial year when the annual range is unset', () =>
    expect(yearTypeOnlyToDate(2020, 0, 2)).toBe('2021-03-31'));
  it('YearTypeID=1, YearRange=1 → Dec 31 (Jan start + 1yr - 1day)', () =>
    expect(yearTypeOnlyToDate(2020, 1, 1)).toBe('2020-12-31'));
  it('YearTypeID=2 (Financial), YearRange=1 → Mar 31 of next year', () =>
    expect(yearTypeOnlyToDate(2020, 1, 2)).toBe('2021-03-31'));
  it('YearTypeID=2, YearRange=5 → 5yr financial period end', () =>
    expect(yearTypeOnlyToDate(2015, 5, 2)).toBe('2020-03-31'));
  it('YearTypeID=10, YearRange=5 → same as YearTypeID=2', () =>
    expect(yearTypeOnlyToDate(2015, 5, 10)).toBe('2020-03-31'));
  it('YearTypeID=3 (Academic), YearRange=1 → Aug 31 of next year', () =>
    expect(yearTypeOnlyToDate(2020, 1, 3)).toBe('2021-08-31'));
  it('YearTypeID=17, YearRange=5 → Jan 31 of Year+1 (ignores YearRange)', () =>
    expect(yearTypeOnlyToDate(2020, 5, 17)).toBe('2021-01-31'));
  it('YearTypeID=18, YearRange=3 → last day of Feb Year+1', () =>
    expect(yearTypeOnlyToDate(2020, 3, 18)).toBe('2021-02-28'));
  it('YearTypeID=18 leap year → Feb 29', () =>
    expect(yearTypeOnlyToDate(2019, 3, 18)).toBe('2020-02-29'));
  it('YearTypeID=9 (Mar-Feb), YearRange=1 → Feb 28', () =>
    expect(yearTypeOnlyToDate(2020, 1, 9)).toBe('2021-02-28'));
  it('YearTypeID=11 (Oct-Sep), YearRange=1 → Sep 30 next year', () =>
    expect(yearTypeOnlyToDate(2020, 1, 11)).toBe('2021-09-30'));
});

describe('computeDates', () => {
  it.each([2, 3])('maps source month 1 to April for year type %s', (type) => {
    expect(computeDates(2023, 1, -1, 1, type)).toEqual({
      fromDate: '2023-04-01',
      toDate: '2023-04-30',
    });
    expect(computeDates(2023, 11, -1, 1, type)).toEqual({
      fromDate: '2024-02-01',
      toDate: '2024-02-29',
    });
    expect(computeDates(2023, 12, -1, 1, type)).toEqual({
      fromDate: '2024-03-01',
      toDate: '2024-03-31',
    });
  });
  it('preserves the published mid-November survey boundaries', () => {
    expect(computeDates(2022, -1, -1, 2, 14)).toEqual({
      fromDate: '2022-11-16',
      toDate: '2024-11-15',
    });
  });
  it('refuses an unverified academic quarter instead of assigning calendar dates', () => {
    expect(() => computeDates(2023, -1, 1, 1, 3)).toThrow('Academic quarters');
  });
  it.each([4, 5, 6])('refuses unsupported multi-year rolling type %s', (type) => {
    expect(() => computeDates(2023, -1, -1, 3, type)).toThrow('Rolling year range');
  });
  it('refuses a financial rolling monthly period without verified source semantics', () => {
    expect(() => computeDates(2022, 6, -1, 1, 12)).toThrow('verified source mapping');
  });

  it.each([
    [2, -1, 1, '2022-04-01', '2022-06-30'],
    [4, -1, 2, '2022-07-01', '2023-06-30'],
    [5, -1, 2, '2022-04-01', '2023-03-31'],
    [6, 6, -1, '2022-06-01', '2023-05-31'],
    [7, -1, 2, '2022-04-01', '2022-09-30'],
    [16, -1, -1, '2022-03-31', '2022-03-31'],
  ])(
    'preserves the period represented by live year type %s',
    (type, month, quarter, fromDate, toDate) => {
      expect(computeDates(2022, Number(month), Number(quarter), 1, Number(type))).toEqual({
        fromDate,
        toDate,
      });
    },
  );

  it.each([
    [1, '2022-06-30'],
    [4, '2023-03-31'],
    [5, '2023-06-30'],
    [17, '2026-06-30'],
    [20, '2027-03-31'],
  ])('preserves financial cumulative quarter %s as a distinct period', (quarter, toDate) => {
    expect(computeDates(2022, -1, Number(quarter), 5, 10)).toEqual({
      fromDate: '2022-04-01',
      toDate,
    });
  });

  it('Month branch: specific month date range', () => {
    expect(computeDates(2020, 3, -1, 0, 1)).toEqual({
      fromDate: '2020-03-01',
      toDate: '2020-03-31',
    });
  });
  it('Month branch: Feb in leap year', () => {
    expect(computeDates(2020, 2, -1, 0, 1)).toEqual({
      fromDate: '2020-02-01',
      toDate: '2020-02-29',
    });
  });
  it('Quarter=1 → Jan–Mar', () => {
    expect(computeDates(2020, -1, 1, 0, 1)).toEqual({
      fromDate: '2020-01-01',
      toDate: '2020-03-31',
    });
  });
  it('Quarter=2 → Apr–Jun', () => {
    expect(computeDates(2020, -1, 2, 0, 1)).toEqual({
      fromDate: '2020-04-01',
      toDate: '2020-06-30',
    });
  });
  it('Quarter=3 → Jul–Sep', () => {
    expect(computeDates(2020, -1, 3, 0, 1)).toEqual({
      fromDate: '2020-07-01',
      toDate: '2020-09-30',
    });
  });
  it('Quarter=4 → Oct–Dec', () => {
    expect(computeDates(2020, -1, 4, 0, 1)).toEqual({
      fromDate: '2020-10-01',
      toDate: '2020-12-31',
    });
  });
  it('rejects a non-calendar quarter for a calendar year', () => {
    expect(() => computeDates(2020, -1, 5, 0, 1)).toThrow('Unsupported quarter');
  });
  it('YearTypeID=2 (Financial), YearRange=0', () => {
    expect(computeDates(2020, -1, -1, 0, 2)).toEqual({
      fromDate: '2020-04-01',
      toDate: '2021-03-31',
    });
  });
  it('YearTypeID=2 (Financial), YearRange=1 → full financial year', () => {
    expect(computeDates(2020, -1, -1, 1, 2)).toEqual({
      fromDate: '2020-04-01',
      toDate: '2021-03-31',
    });
  });
  it('YearTypeID=10 (Financial multi-year), YearRange=5', () => {
    expect(computeDates(2015, -1, -1, 5, 10)).toEqual({
      fromDate: '2015-04-01',
      toDate: '2020-03-31',
    });
  });
  it('YearTypeID=17 (Sep-Jan), YearRange=5 → to_date Jan 31 Year+1', () => {
    expect(computeDates(2020, -1, -1, 5, 17)).toEqual({
      fromDate: '2020-09-01',
      toDate: '2021-01-31',
    });
  });
  it('YearTypeID=18 (Sep-Feb), YearRange=3 → to_date end-of-Feb Year+1', () => {
    expect(computeDates(2020, -1, -1, 3, 18)).toEqual({
      fromDate: '2020-09-01',
      toDate: '2021-02-28',
    });
  });
  it('Month takes priority over Quarter', () => {
    expect(computeDates(2020, 6, 2, 0, 1)).toEqual({
      fromDate: '2020-06-01',
      toDate: '2020-06-30',
    });
  });
});
