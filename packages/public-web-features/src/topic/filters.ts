import { INDICATOR_SORTS, type IndicatorSort } from '@fphd/utils/indicator-sort';
import { DIMENSIONS, PERIOD_PARAMS, type SearchState } from '../search/url.ts';

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
  // React Router adds _routes to a data request that loads only some routes. The loader sees it in
  // the request URL, but the browser's URL never has it, so the two keys would never match.
  params.delete('_routes');
  for (const key of AREA_SORT_PARAMS) params.delete(key);
  params.set('sort', topicSort(params.get('sort')) ?? 'subtopic-asc');
  params.sort();
  return `${url.pathname}?${params}`;
}

/**
 * Whether a search term, an indicator filter or a chosen area narrows the topic's indicators. A
 * geography type alone doesn't: it only says which areas to show.
 */
export function narrowsTopicIndicators(state: SearchState) {
  return (
    state.q !== '' ||
    Boolean(state.subtopics?.length) ||
    state.gaCodes.length > 0 ||
    DIMENSIONS.some(({ stateKey }) => (state[stateKey] as string[]).length > 0) ||
    PERIOD_PARAMS.some((key) => Boolean(state[key]))
  );
}
