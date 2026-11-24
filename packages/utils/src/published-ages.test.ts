import { expect, it } from 'vitest';
import { filterSeries, type PublishedGrouping, publishedAgeChoice } from './observation-series.ts';

const groupings = ['18+ yrs', '65+ yrs'].map((age) => ({
  age,
  sex: null,
  yearRange: 1,
  periodKind: 'annual',
})) as [PublishedGrouping, PublishedGrouping];
function point(age: number) {
  return {
    fromDate: '2024-04-01',
    toDate: '2025-03-31',
    value: age as number | null,
    dimensions: [{ type: 'Age', value: `${age}+ yrs`, ageFrom: `P${age}Y` }],
  };
}
const points = [18, 65, 75, 85].map(point);

it('offers only published ages, deduplicated across periods and defaults to the headline age', () => {
  expect(publishedAgeChoice(points, [...groupings, { ...groupings[0], yearRange: 3 }])).toEqual({
    options: ['18+ yrs', '65+ yrs'],
    value: '18+ yrs',
  });
});

it('honours a published age and ignores an unpublished or stale URL age', () => {
  expect(publishedAgeChoice(points, groupings, '65+ yrs').value).toBe('65+ yrs');
  for (const age of ['75+ yrs', 'unknown']) {
    expect(publishedAgeChoice(points, groupings, age).value).toBe('18+ yrs');
  }
  expect(filterSeries(points, { age: '65+ yrs' })).toEqual([points[1]]);
});

it('uses newest period before widest age, including a suppressed latest point', () => {
  expect(
    publishedAgeChoice([...points, { ...point(65), toDate: '2026-03-31', value: null }], groupings)
      .value,
  ).toBe('65+ yrs');
});

it('respects published sex tuples and represents an age aggregate without an Age dimension', () => {
  const sexed = [
    { ...groupings[0], sex: 'Female' },
    { ...groupings[1], sex: 'Male' },
  ];
  expect(publishedAgeChoice(points, sexed, '18+ yrs', 'Male')).toEqual({
    options: ['65+ yrs'],
    value: '65+ yrs',
  });
  const all = { ...groupings[0], age: 'All ages' };
  const total = { ...point(18), dimensions: [] };
  expect(publishedAgeChoice([...points, total], [all, ...groupings]).value).toBe('All ages');
  expect(filterSeries([total, ...points], { age: 'All ages' })).toEqual([total]);
  expect(publishedAgeChoice(points, [])).toEqual({ options: [], value: '' });
});
