import { expect, it } from 'vitest';
import { topicDataKey, topicDisplayParams } from './filters.ts';

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
