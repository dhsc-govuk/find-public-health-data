import { describe, expect, it } from 'vitest';

import { searchPageCount, searchPageNumber } from './pagination.ts';

describe('searchPageNumber', () => {
  it.each([
    ['2', 2],
    ['16', 16],
  ])('reads page %j as %i', (value, expected) => {
    expect(searchPageNumber(value)).toBe(expected);
  });

  it.each([null, '', '0', '-1', '1.5', '2e3', ' 2', 'two', '99999999999999999999'])(
    'reads %j as the first page',
    (value) => {
      expect(searchPageNumber(value)).toBe(1);
    },
  );
});

describe('searchPageCount', () => {
  it.each([
    [0, 1],
    [1, 1],
    [50, 1],
    [51, 2],
    [785, 16],
  ])('fills %i results into %i pages of 50', (total, expected) => {
    expect(searchPageCount(total, 50)).toBe(expected);
  });
});
