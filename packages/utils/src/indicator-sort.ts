export const INDICATOR_SORTS = [
  'subtopic-asc',
  'subtopic-desc',
  'name-asc',
  'name-desc',
  'period-desc',
  'recently-updated',
  'trend-desc',
  'trend-asc',
  'trend-better',
  'trend-worse',
] as const;

export type IndicatorSort = (typeof INDICATOR_SORTS)[number];

export function indicatorSort(value: unknown): IndicatorSort | undefined {
  return INDICATOR_SORTS.find((sort) => sort === value);
}

// Relevance is the search's default order, so the API receives no sort for it.
export const SEARCH_SORTS = ['relevance', 'recently-updated'] as const;

export type SearchSort = (typeof SEARCH_SORTS)[number];

export function searchSort(value: unknown): SearchSort {
  return SEARCH_SORTS.find((sort) => sort === value) ?? 'relevance';
}
