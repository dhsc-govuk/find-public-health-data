import { indicatorSort } from '@fphd/utils/indicator-sort';

const AREA_SORT_PARAMS = ['areaRowSort', 'sortAreas'];

export function topicDisplayParams(params: URLSearchParams) {
  return Object.fromEntries(
    [...params].filter(
      ([key]) =>
        key === 'columns-topic' ||
        key === 'sort' ||
        key === 'render' ||
        AREA_SORT_PARAMS.includes(key),
    ),
  );
}

export function topicDataKey(url: { pathname: string; search: string }) {
  const params = new URLSearchParams(url.search);
  params.delete('columns-topic');
  params.delete('tab-topic');
  for (const key of AREA_SORT_PARAMS) params.delete(key);
  params.set('sort', indicatorSort(params.get('sort')) ?? 'subtopic-asc');
  params.sort();
  return `${url.pathname}?${params}`;
}
