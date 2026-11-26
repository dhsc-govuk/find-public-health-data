import { describe, expect, it } from 'vitest';

import { goalBandsText, goalVerdict, type PolicyGoalBands } from './policy-goal.ts';

const range: PolicyGoalBands = {
  lower: 10,
  lowerComparison: 'less-than',
  upper: 20,
  upperComparison: 'more-than',
  polarity: 'higher-is-better',
};

const single: PolicyGoalBands = {
  lower: 10,
  lowerComparison: 'less-than',
  upper: null,
  upperComparison: null,
  polarity: 'higher-is-better',
};

describe('goalVerdict', () => {
  it('rates the band above the upper value good and the band below the lower value bad when high is good', () => {
    expect(goalVerdict(21, range)).toBe('good');
    expect(goalVerdict(9, range)).toBe('bad');
    expect(goalVerdict(15, range)).toBe('neither');
  });

  it('rates the band below the lower value good when low is good', () => {
    const lowIsGood = { ...range, polarity: 'lower-is-better' } as const;

    expect(goalVerdict(9, lowIsGood)).toBe('good');
    expect(goalVerdict(21, lowIsGood)).toBe('bad');
    expect(goalVerdict(15, lowIsGood)).toBe('neither');
  });

  it('puts each boundary value in its band only when its comparison includes it', () => {
    expect(goalVerdict(10, range)).toBe('neither');
    expect(goalVerdict(20, range)).toBe('neither');

    const inclusive = {
      ...range,
      lowerComparison: 'less-than-or-equal',
      upperComparison: 'more-than-or-equal',
    } as const;
    expect(goalVerdict(10, inclusive)).toBe('bad');
    expect(goalVerdict(20, inclusive)).toBe('good');
  });

  it('rates every value outside the lower band of a single goal value the other way', () => {
    expect(goalVerdict(9, single)).toBe('bad');
    expect(goalVerdict(10, single)).toBe('good');
    expect(goalVerdict(10, { ...single, lowerComparison: 'less-than-or-equal' })).toBe('bad');
    expect(goalVerdict(9, { ...single, polarity: 'lower-is-better' })).toBe('good');
    expect(goalVerdict(10, { ...single, polarity: 'lower-is-better' })).toBe('bad');
  });
});

describe('goalBandsText', () => {
  const plain = (value: number) => String(value);

  it('names the good band first, with each comparison as its sign', () => {
    expect(goalBandsText(range, plain)).toBe('>20 is good, <10 is bad');
    expect(
      goalBandsText(
        {
          ...range,
          lowerComparison: 'less-than-or-equal',
          upperComparison: 'more-than-or-equal',
          polarity: 'lower-is-better',
        },
        plain,
      ),
    ).toBe('≤10 is good, ≥20 is bad');
  });

  it('gives a single goal value as the side of it that is good', () => {
    expect(goalBandsText(single, plain)).toBe('≥10 is good');
    expect(goalBandsText({ ...single, lowerComparison: 'less-than-or-equal' }, plain)).toBe(
      '>10 is good',
    );
    expect(goalBandsText({ ...single, polarity: 'lower-is-better' }, plain)).toBe('<10 is good');
  });

  it('writes each value with the format it is given', () => {
    expect(goalBandsText(single, (value) => `${value}%`)).toBe('≥10% is good');
  });
});
