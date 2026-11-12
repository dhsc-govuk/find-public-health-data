import { describe, expect, it } from 'vitest';

import { type DiffRun, wordDiff } from './word-diff.ts';

function joined(runs: readonly DiffRun[], left: DiffRun['change']): string {
  return runs
    .filter(({ change }) => change !== left)
    .map(({ text }) => text)
    .join('');
}

describe('wordDiff', () => {
  it('keeps text that has not changed as one unchanged run', () => {
    expect(wordDiff('Deaths in the year.', 'Deaths in the year.')).toEqual([
      { change: 'unchanged', text: 'Deaths in the year.' },
    ]);
  });

  it('adds every word of text that was empty before', () => {
    expect(wordDiff('', 'Deaths in the year.')).toEqual([
      { change: 'added', text: 'Deaths in the year.' },
    ]);
  });

  it('removes every word of text that is empty after', () => {
    expect(wordDiff('Deaths in the year.', '')).toEqual([
      { change: 'removed', text: 'Deaths in the year.' },
    ]);
  });

  it.each([
    ['Deaths in the year.', 'Deaths registered in the year.'],
    ['Under 75 mortality rate', 'Under 75 mortality rate from cardiovascular disease'],
    ['A rate per 100,000 people', 'A count of people'],
  ])('rebuilds both texts from its runs: %s, then %s', (before, after) => {
    const runs = wordDiff(before, after);

    expect(joined(runs, 'added')).toBe(before);
    expect(joined(runs, 'removed')).toBe(after);
  });
});
