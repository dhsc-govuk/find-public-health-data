import { INDICATOR_SORTS, type IndicatorSort } from '@fphd/utils/indicator-sort';

// The topic Data tab doesn't offer the search page's "Recently updated" order.
export type TopicSort = Exclude<IndicatorSort, 'recently-updated'>;

export const TOPIC_SORT_VALUES = INDICATOR_SORTS.filter(
  (sort): sort is TopicSort => sort !== 'recently-updated',
);

export function topicSort(value: unknown): TopicSort | undefined {
  return TOPIC_SORT_VALUES.find((sort) => sort === value);
}

const AREA_SORT_PARAMS = ['areaRowSort', 'sortAreas'];

export function topicDisplayParams(params: URLSearchParams) {
  return Object.fromEntries(
    [...params].filter(
      ([key]) => key === 'columns-topic' || key === 'sort' || AREA_SORT_PARAMS.includes(key),
    ),
  );
}

export function topicDataKey(url: { pathname: string; search: string }) {
  const params = new URLSearchParams(url.search);
  params.delete('columns-topic');
  params.delete('tab-topic');
  for (const key of AREA_SORT_PARAMS) params.delete(key);
  params.set('sort', topicSort(params.get('sort')) ?? 'subtopic-asc');
  params.sort();
  return `${url.pathname}?${params}`;
}
