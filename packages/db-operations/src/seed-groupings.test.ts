import { type PublishedGrouping, publishedSeries } from '@fphd/utils/observation-series';
import { expect, it } from 'vitest';

import { readSeedTable } from './seed-csv.testing.ts';

const indicators = readSeedTable('indicator');
const values = new Map(readSeedTable('dimension_value').map((row) => [row.id, row.name]));
const groupings = readSeedTable('indicator_grouping');

function publishedGroupings(shortId: number): PublishedGrouping[] {
  const indicator = indicators.find((row) => Number(row.short_id) === shortId);
  expect(indicator).toBeDefined();
  return groupings
    .filter((row) => row.indicator_id === indicator?.id)
    .map((row) => ({
      sex: values.get(row.sex_id) ?? null,
      age: values.get(row.age_id) ?? 'All ages',
      yearRange: Number(row.year_range),
      periodKind: row.period_kind as PublishedGrouping['periodKind'],
    }));
}

function observations(ages: string[]) {
  return [null, 'Female', 'Male'].flatMap((sex) =>
    ages.map((age) => ({
      fromDate: '2024-01-01',
      toDate: '2024-12-31',
      dimensions: [
        ...(sex ? [{ type: 'Sex', value: sex }] : []),
        ...(age === 'All ages' ? [] : [{ type: 'Age', value: age }]),
      ],
    })),
  );
}

it('seeds all three published sexes and one age for indicator 108 at both period lengths', () => {
  const published = publishedGroupings(108);
  expect(published).toHaveLength(6);
  expect(published).toEqual(
    expect.arrayContaining(
      [null, 'Female', 'Male'].flatMap((sex) =>
        [1, 3].map((yearRange) => ({
          sex,
          age: '<75 yrs',
          yearRange,
          periodKind: 'annual',
        })),
      ),
    ),
  );
  const points = observations(['<75 yrs', '75+ yrs']);
  expect(publishedSeries(points, published)).toEqual([points[0], points[2], points[4]]);
});

it.each([
  { shortId: 92443, ages: ['18+ yrs'], yearRanges: [1, 3] },
  { shortId: 93622, ages: ['All ages', '<18 yrs'], yearRanges: [1] },
])('seeds only the published persons/age pairs for $shortId', ({ shortId, ages, yearRanges }) => {
  const published = publishedGroupings(shortId);
  expect(published).toHaveLength(ages.length * yearRanges.length);
  expect(published).toEqual(
    expect.arrayContaining(
      ages.flatMap((age) =>
        yearRanges.map((yearRange) => ({ sex: null, age, yearRange, periodKind: 'annual' })),
      ),
    ),
  );
  const points = observations([...ages, '65+ yrs']);
  expect(publishedSeries(points, published)).toEqual(points.slice(0, ages.length));
});
