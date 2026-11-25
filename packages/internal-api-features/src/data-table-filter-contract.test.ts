import { describe, expect, it } from 'vitest';

import { checkColumnKeys, dataTableValuesQuerySchema } from './data-table-filter-contract.ts';

describe('checkColumnKeys', () => {
  it('lists the columns a file has in display order, its two dates as one period', () => {
    expect(
      checkColumnKeys(['area_code', 'period_start', 'period_end', 'value', 'sex', 'value_note']),
    ).toEqual(['value', 'period', 'areaCode', 'sex', 'valueNote']);
  });
});

describe('dataTableValuesQuerySchema', () => {
  it('reads a column, a search, or both, without the spaces around a search', () => {
    expect(dataTableValuesQuerySchema.parse({ column: 'period' })).toEqual({
      column: 'period',
      search: '',
    });
    expect(dataTableValuesQuerySchema.parse({ search: ' <1 yr ' })).toEqual({ search: '<1 yr' });
    expect(dataTableValuesQuerySchema.parse({ column: 'age', search: '75' })).toEqual({
      column: 'age',
      search: '75',
    });
  });

  it.each([
    {},
    { search: ' ' },
    { column: 'area_code' },
    { column: ['sex', 'age'] },
    { search: 'a'.repeat(101) },
  ])('refuses %j', (query) => {
    expect(dataTableValuesQuerySchema.safeParse(query).success).toBe(false);
  });
});
