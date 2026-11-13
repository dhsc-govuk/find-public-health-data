import { expect, it } from 'vitest';
import { topicDataKey, topicDisplayParams, topicSort } from './filters.ts';

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

it('carries area sorting and complete rendering through topic filter forms', () => {
  const display = {
    'columns-topic': 'period,value',
    sort: 'name-asc',
    areaRowSort: 'recently-updated',
    sortAreas: 'reverse:1|',
    render: 'complete',
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
