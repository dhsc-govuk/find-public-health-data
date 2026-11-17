import { describe, expect, it } from 'vitest';
import { indicatorSort, searchSort } from './indicator-sort.ts';

describe('searchSort', () => {
  it('reads the search page sorts and defaults anything else to relevance', () => {
    expect(searchSort('recently-updated')).toBe('recently-updated');
    expect(searchSort('relevance')).toBe('relevance');
    expect(searchSort('name-asc')).toBe('relevance');
    expect(searchSort(null)).toBe('relevance');
  });
});

describe('indicatorSort', () => {
  it('accepts recently updated as an API sort but not relevance, which is the default', () => {
    expect(indicatorSort('recently-updated')).toBe('recently-updated');
    expect(indicatorSort('relevance')).toBeUndefined();
  });
});
