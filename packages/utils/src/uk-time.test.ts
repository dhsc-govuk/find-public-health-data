import { describe, expect, it } from 'vitest';

import { ukDateTime, ukDaysUntil, ukInstant } from './uk-time.ts';

describe('ukInstant', () => {
  it.each([
    ['a BST time an hour ahead of UTC', [2027, 9, 14, 9, 30], '2027-09-14T08:30:00.000Z'],
    ['a GMT time at UTC', [2027, 1, 14, 9, 30], '2027-01-14T09:30:00.000Z'],
    [
      'the last minute before the spring change in GMT',
      [2027, 3, 28, 0, 59],
      '2027-03-28T00:59:00.000Z',
    ],
    [
      'the first minute after the spring change in BST',
      [2027, 3, 28, 2, 0],
      '2027-03-28T01:00:00.000Z',
    ],
    [
      'the last minute before the autumn change in BST',
      [2027, 10, 31, 0, 59],
      '2027-10-30T23:59:00.000Z',
    ],
    [
      'the first minute the autumn change repeats as GMT',
      [2027, 10, 31, 1, 0],
      '2027-10-31T01:00:00.000Z',
    ],
    ['a time the autumn change repeats as GMT', [2027, 10, 31, 1, 30], '2027-10-31T01:30:00.000Z'],
    [
      'the last minute the autumn change repeats as GMT',
      [2027, 10, 31, 1, 59],
      '2027-10-31T01:59:00.000Z',
    ],
    [
      'the first minute after the autumn change in GMT',
      [2027, 10, 31, 2, 0],
      '2027-10-31T02:00:00.000Z',
    ],
  ] as const)('finds %s', (_, [year, month, day, hour, minute], utc) => {
    expect(ukInstant({ year, month, day, hour, minute })?.toISOString()).toBe(utc);
  });

  it.each([
    [1, 0],
    [1, 30],
    [1, 59],
  ])('finds no instant for %i:%i on the day the spring change skips it', (hour, minute) => {
    expect(ukInstant({ year: 2027, month: 3, day: 28, hour, minute })).toBeNull();
  });

  it('finds no instant for a date the calendar does not hold', () => {
    expect(ukInstant({ year: 2027, month: 2, day: 31, hour: 9, minute: 30 })).toBeNull();
  });
});

describe('ukDateTime', () => {
  it.each([
    ['in BST, an hour ahead of UTC', '2027-09-14T08:30:00.000Z', [2027, 9, 14, 9, 30]],
    ['in GMT, at UTC', '2027-01-04T15:05:00.000Z', [2027, 1, 4, 15, 5]],
    [
      'before midnight in UTC as the next day in BST',
      '2027-09-14T23:30:00.000Z',
      [2027, 9, 15, 0, 30],
    ],
    ['the first occurrence of a repeated time', '2027-10-31T00:30:00.000Z', [2027, 10, 31, 1, 30]],
    ['the second occurrence of a repeated time', '2027-10-31T01:30:00.000Z', [2027, 10, 31, 1, 30]],
  ] as const)('reads an instant %s', (_, instant, [year, month, day, hour, minute]) => {
    expect(ukDateTime(new Date(instant))).toEqual({ year, month, day, hour, minute });
  });
});

describe('ukDaysUntil', () => {
  const twelfthOfOctober = { year: 2027, month: 10, day: 12 };

  it.each([
    ['09:30 BST on 14 September', '2027-09-14T08:30:00.000Z', 28],
    ['the last minute of 14 September in the UK', '2027-09-14T22:59:00.000Z', 28],
    [
      'the first minute of 15 September in the UK, still 14 September in UTC',
      '2027-09-14T23:00:00.000Z',
      27,
    ],
  ])('counts calendar days to 12 October from %s', (_, instant, days) => {
    expect(ukDaysUntil(new Date(instant), twelfthOfOctober)).toBe(days);
  });

  it('counts calendar days across a clock change, not 24-hour days', () => {
    // 09:30 GMT on 5 March to 2 April in BST is an hour short of 28 × 24 hours.
    expect(
      ukDaysUntil(new Date('2027-03-05T09:30:00.000Z'), { year: 2027, month: 4, day: 2 }),
    ).toBe(28);
  });

  it('counts a date before the UK date as negative', () => {
    expect(
      ukDaysUntil(new Date('2027-09-14T08:30:00.000Z'), { year: 2027, month: 9, day: 13 }),
    ).toBe(-1);
  });
});
