import { describe, expect, it } from 'vitest';

import { dataTablePageQuerySchema } from './data-table-check-contract.ts';
import { MAX_DATA_TABLE_FILTERS } from './data-table-filter-contract.ts';

describe('dataTablePageQuerySchema', () => {
  it('takes the first page of 10 rows, unfiltered, when nothing is given', () => {
    expect(dataTablePageQuerySchema.parse({})).toEqual({
      page: 1,
      rowsPerPage: 10,
      filterIds: [],
      filtersLimited: false,
    });
  });

  it.each([
    ['10', 10],
    ['25', 25],
    ['50', 50],
  ])('reads %s rows per page', (rowsPerPage, expected) => {
    expect(dataTablePageQuerySchema.parse({ page: '4', rowsPerPage })).toMatchObject({
      page: 4,
      rowsPerPage: expected,
    });
  });

  it.each([
    ['one filter', 'sex.0123456789', ['sex.0123456789']],
    [
      'several, in order and each once',
      ['sex.0123456789', 'lowerCi95.abcdef0123', 'sex.0123456789'],
      ['sex.0123456789', 'lowerCi95.abcdef0123'],
    ],
  ])('reads %s', (_, f, filterIds) => {
    expect(dataTablePageQuerySchema.parse({ f })).toMatchObject({
      filterIds,
      filtersLimited: false,
    });
  });

  it('keeps the first filters up to the most allowed, and says it left some out', () => {
    const f = Array.from(
      { length: MAX_DATA_TABLE_FILTERS + 1 },
      (_, index) => `value.${String(index).padStart(10, '0')}`,
    );

    expect(dataTablePageQuerySchema.parse({ f: f.slice(0, -1) })).toMatchObject({
      filterIds: f.slice(0, -1),
      filtersLimited: false,
    });
    expect(dataTablePageQuerySchema.parse({ f })).toMatchObject({
      filterIds: f.slice(0, -1),
      filtersLimited: true,
    });
  });

  it.each([
    { page: '0' },
    { page: '1.5' },
    { page: 'x' },
    { page: '1e300' },
    { page: ['1', '2'] },
    { rowsPerPage: '20' },
    { rowsPerPage: '' },
    { f: '' },
    { f: 'sex' },
    { f: 'sex.Female' },
    { f: 'sex.ABCDEF0123' },
    { f: 'area_code.0123456789' },
    { f: ['sex.0123456789', 'sex.01234567890'] },
  ])('refuses %j', (query) => {
    expect(dataTablePageQuerySchema.safeParse(query).success).toBe(false);
  });
});
