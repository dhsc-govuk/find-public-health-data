import { indicatorSort } from '@fphd/utils/indicator-sort';

export function topicDataKey(url: { pathname: string; search: string }) {
  const params = new URLSearchParams(url.search);
  params.delete('columns-topic');
  params.delete('tab-topic');
  params.set('sort', indicatorSort(params.get('sort')) ?? 'subtopic-asc');
  params.sort();
  return `${url.pathname}?${params}`;
}

export function topicTab({ search }: { search: string }) {
  const tab = new URLSearchParams(search).get('tab-topic');
  return tab === 'data' || tab === 'areas' || tab === 'publications' ? tab : 'overview';
}
