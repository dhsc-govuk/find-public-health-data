import { expect, it } from 'vitest';
import { EMPTY_SEARCH_STATE } from '../search/url.ts';
import { narrowsTopicIndicators, topicDataKey, topicDisplayParams, topicSort } from './filters.ts';

it('revalidates server filters while keeping tab and column switches local', () => {
  const base = new URL('http://local/topics/diabetes');
  expect(
    topicDataKey(
      new URL(
        '?sort=subtopic-asc&tab-topic=data&columns-topic=count&areaRowSort=name-desc&sortAreas=first:1|',
        base,
      ),
    ),
  ).toBe(topicDataKey(base));
  for (const query of ['?subtopic=care', '?it=outcome', '?geo=NHS+regions', '?q=prevalence'])
    expect(topicDataKey(new URL(query, base))).not.toBe(topicDataKey(base));
});

it('builds the same key from a data request that loads only some routes', () => {
  const page = new URL('http://local/topics/diabetes?geo=NHS+regions');
  const dataRequest = new URL(
    'http://local/topics/diabetes?geo=NHS+regions&_routes=..%2Ftopic%2Froute',
  );
  expect(topicDataKey(dataRequest)).toBe(topicDataKey(page));
});

it('carries columns and sorting through topic filter forms', () => {
  const display = {
    'columns-topic': 'period,value',
    sort: 'name-asc',
    areaRowSort: 'recently-updated',
    sortAreas: 'reverse:1|',
  };
  expect(topicDisplayParams(new URLSearchParams({ ...display, q: 'diabetes', page: '2' }))).toEqual(
    display,
  );
});

it("doesn't offer the search page's recently updated sort on the topic Data tab", () => {
  expect(topicSort('recently-updated')).toBeUndefined();
  expect(topicSort('period-desc')).toBe('period-desc');
  const base = new URL('http://local/topics/diabetes');
  expect(topicDataKey(new URL('?sort=recently-updated', base))).toBe(topicDataKey(base));
});

it('counts a search term, filter, period or chosen area as narrowing the topic, but not a geography type', () => {
  expect(narrowsTopicIndicators({ ...EMPTY_SEARCH_STATE, geoLevels: ['NHS regions'] })).toBe(false);
  for (const narrowed of [
    { q: 'smoking' },
    { subtopics: ['care'] },
    { indicatorTypes: ['outcome'] },
    { sources: ['NHS England'] },
    { fromYear: '2020' },
    { gaCodes: ['E40000003'] },
  ])
    expect(narrowsTopicIndicators({ ...EMPTY_SEARCH_STATE, ...narrowed })).toBe(true);
});
