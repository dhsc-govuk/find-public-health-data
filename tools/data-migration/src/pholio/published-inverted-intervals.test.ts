import { expect, it } from 'vitest';
import publishedInvertedIntervals from './published-inverted-intervals.ts';

it('lists each source row once', () => {
  const uids = publishedInvertedIntervals.map((entry) => entry.uid);
  expect(new Set(uids).size).toBe(uids.length);
});

it.each(publishedInvertedIntervals)('lists uid $uid with its 95% limits inverted', (entry) => {
  expect(entry.LowerCI95).toBeGreaterThan(entry.UpperCI95);
});
