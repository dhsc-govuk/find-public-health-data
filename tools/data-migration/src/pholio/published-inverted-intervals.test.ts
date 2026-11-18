import { expect, it } from 'vitest';
import publishedInvertedIntervals from './published-inverted-intervals.ts';

it('lists each of the 124 source rows once', () => {
  const uids = publishedInvertedIntervals.map((entry) => entry.uid);
  expect(uids).toHaveLength(124);
  expect(new Set(uids).size).toBe(uids.length);
});

it.each(publishedInvertedIntervals)('lists uid $uid with its 95% limits inverted', (entry) => {
  expect(entry.LowerCI95).toBeGreaterThan(entry.UpperCI95);
});
