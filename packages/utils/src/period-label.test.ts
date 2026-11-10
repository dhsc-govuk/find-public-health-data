import { describe, expect, it } from 'vitest';

import { expandedPeriodLabel, periodLabel, shortPeriodLabel } from './period-label.ts';
import { publicYearType } from './period-type.ts';

const period = (fromDate: string, toDate: string) => ({ fromDate, toDate });
const financial = publicYearType('financial', null);
const rolling = publicYearType('rolling', null);

describe('expandedPeriodLabel', () => {
  it('expands whole-year periods using their full first and last years', () => {
    expect(expandedPeriodLabel(period('2024-04-01', '2025-03-31'), financial)).toBe('2024 to 2025');
    expect(expandedPeriodLabel(period('2017-04-01', '2018-03-31'))).toBe('2017 to 2018');
    expect(expandedPeriodLabel(period('2015-01-01', '2017-12-31'))).toBe('2015 to 2017');
    expect(expandedPeriodLabel(period('2020-04-01', '2023-03-31'), financial)).toBe('2020 to 2023');
    expect(expandedPeriodLabel(period('1999-04-01', '2000-03-31'), financial)).toBe('1999 to 2000');
    expect(expandedPeriodLabel(period('2023-01-01', '2023-12-31'))).toBe('2023');
  });

  it('preserves month, day and rolling-year wording', () => {
    for (const dates of [
      period('2026-01-01', '2026-03-31'),
      period('2022-04-01', '2023-03-31'),
      period('2023-03-31', '2023-03-31'),
      period('2022-04-06', '2023-04-05'),
    ]) {
      expect(expandedPeriodLabel(dates, rolling)).toBe(periodLabel(dates, rolling));
    }
  });
});

describe('shortPeriodLabel', () => {
  it('abbreviates calendar ranges and preserves financial years and other period shapes', () => {
    expect(shortPeriodLabel(period('2015-01-01', '2017-12-31'))).toBe('2015-17');
    expect(shortPeriodLabel(period('2017-04-01', '2018-03-31'), financial)).toBe('2017/18');
    expect(shortPeriodLabel(period('2023-01-01', '2023-12-31'))).toBe('2023');
    expect(shortPeriodLabel(period('2026-01-01', '2026-03-31'))).toBe('January to March 2026');
    expect(shortPeriodLabel(period('2022-04-01', '2023-03-31'), rolling)).toBe(
      'April 2022 to March 2023',
    );
    expect(shortPeriodLabel(period('1999-01-01', '2001-12-31'))).toBe('1999-2001');
  });
});

describe('periodLabel', () => {
  it('labels a calendar year with the year alone', () => {
    expect(periodLabel(period('2023-01-01', '2023-12-31'))).toBe('2023');
  });

  it('labels a run of calendar years with its first and last years', () => {
    expect(periodLabel(period('2021-01-01', '2023-12-31'))).toBe('2021 to 2023');
  });

  it.each([
    ['a financial year', financial],
    [
      'a year ending on a specified 31 March',
      publicYearType('specified-end-date', { day: 31, month: 3 }),
    ],
    ['no year type, as before the period type is answered', null],
  ])('labels %s as one period spanning two years', (_, yearType) => {
    expect(periodLabel(period('2022-04-01', '2023-03-31'), yearType)).toBe('2022/23');
  });

  it.each([
    ['an academic year', publicYearType('academic', null)],
    ['a year ending on another date', publicYearType('specified-end-date', { day: 31, month: 7 })],
  ])('labels %s spanning two calendar years the same way', (_, yearType) => {
    expect(periodLabel(period('2022-08-01', '2023-07-31'), yearType)).toBe('2022/23');
  });

  it('labels a year ending on a date other than a month end the same way', () => {
    expect(periodLabel(period('2022-11-16', '2023-11-15'))).toBe('2022/23');
  });

  it('labels a run of years spanning calendar years with its first and last years', () => {
    expect(periodLabel(period('2020-04-01', '2023-03-31'), financial)).toBe('2020/21 to 2022/23');
    expect(periodLabel(period('2015-09-01', '2020-08-31'))).toBe('2015/16 to 2019/20');
  });

  it('writes the year after 1999 as 00', () => {
    expect(periodLabel(period('1999-04-01', '2000-03-31'))).toBe('1999/00');
  });

  it('labels a month with its name and year', () => {
    expect(periodLabel(period('2026-01-01', '2026-01-31'))).toBe('January 2026');
    expect(periodLabel(period('2026-02-01', '2026-02-28'))).toBe('February 2026');
    expect(periodLabel(period('2028-02-01', '2028-02-29'))).toBe('February 2028');
  });

  it('tells apart the months and quarters of one year', () => {
    const labels = [
      period('2026-01-01', '2026-01-31'),
      period('2026-02-01', '2026-02-28'),
      period('2026-01-01', '2026-03-31'),
      period('2026-04-01', '2026-06-30'),
    ].map((p) => periodLabel(p, financial));

    expect(labels).toEqual([
      'January 2026',
      'February 2026',
      'January to March 2026',
      'April to June 2026',
    ]);
  });

  it('labels months crossing a calendar year with both years', () => {
    expect(periodLabel(period('2025-11-01', '2026-01-31'))).toBe('November 2025 to January 2026');
  });

  it('labels rolling years spanning two calendar years by their months', () => {
    expect(periodLabel(period('2022-04-01', '2023-03-31'), rolling)).toBe(
      'April 2022 to March 2023',
    );
    expect(periodLabel(period('2022-05-01', '2023-04-30'), rolling)).toBe('May 2022 to April 2023');
  });

  it('labels a rolling year from 1 January as the calendar year', () => {
    expect(periodLabel(period('2023-01-01', '2023-12-31'), rolling)).toBe('2023');
  });

  it('labels a single day with its date', () => {
    expect(periodLabel(period('2023-03-31', '2023-03-31'))).toBe('31 March 2023');
  });

  it('labels any other period with its two dates', () => {
    expect(periodLabel(period('2022-04-06', '2023-04-05'), rolling)).toBe(
      '6 April 2022 to 5 April 2023',
    );
    expect(periodLabel(period('2023-01-15', '2023-02-14'))).toBe(
      '15 January 2023 to 14 February 2023',
    );
  });

  it('reads years 1 to 99 as written', () => {
    expect(periodLabel(period('0050-01-01', '0050-12-31'))).toBe('50');
    expect(periodLabel(period('0050-04-01', '0051-03-31'))).toBe('50/51');
    expect(periodLabel(period('0099-01-01', '0099-01-31'))).toBe('January 99');
    expect(periodLabel(period('0001-01-01', '0003-12-31'))).toBe('1 to 3');
  });
});
