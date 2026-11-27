import { describe, expect, it } from 'vitest';

import { markdownTable, roundOrder, summarise } from './driver-bench-report.ts';

describe('summarise', () => {
  it('takes the middle sample of an odd count', () => {
    expect(summarise([5, 1, 3])).toEqual({ n: 3, median: 3, p95: 5, min: 1 });
  });

  it('averages the middle two samples of an even count', () => {
    expect(summarise([4, 1, 3, 2]).median).toBe(2.5);
  });

  it('takes the 95th percentile by nearest rank', () => {
    const samples = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(summarise(samples).p95).toBe(95);
  });

  it('refuses an empty sample', () => {
    expect(() => summarise([])).toThrow('empty sample');
  });
});

describe('roundOrder', () => {
  it('starts each round one variant further along', () => {
    expect(roundOrder(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c']);
    expect(roundOrder(['a', 'b', 'c'], 1)).toEqual(['b', 'c', 'a']);
    expect(roundOrder(['a', 'b', 'c'], 5)).toEqual(['c', 'a', 'b']);
  });
});

describe('markdownTable', () => {
  it('compares each median with the first variant of the same case', () => {
    const table = markdownTable([
      { case: 'SELECT 1', variant: 'postgres.js', samples: [2, 2, 2] },
      { case: 'SELECT 1', variant: 'pg', samples: [1, 1, 1] },
      { case: 'COPY', variant: 'postgres.js', samples: [40] },
      { case: 'COPY', variant: 'pg', samples: [0.5] },
    ]);
    expect(table.split('\n').slice(2)).toEqual([
      '| SELECT 1 | postgres.js | 3 | 2.00 | 2.00 | 2.00 | 1.00× |',
      '| SELECT 1 | pg | 3 | 1.00 | 1.00 | 1.00 | 0.50× |',
      '| COPY | postgres.js | 1 | 40.0 | 40.0 | 40.0 | 1.00× |',
      '| COPY | pg | 1 | 0.50 | 0.50 | 0.50 | 0.01× |',
    ]);
  });
});
