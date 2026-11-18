import { describe, expect, it } from 'vitest';
import { goalThresholds, goalThresholdText, goalVerdict, type PolicyGoal } from './policy-goal.ts';

describe('policy goals', () => {
  it.each([
    [
      'lower-is-better',
      6,
      '<4% is good, >6% is bad',
      ['Good', 'Neither good nor bad', 'Neither good nor bad', 'Neither good nor bad', 'Bad'],
    ],
    [
      'higher-is-better',
      6,
      '>6% is good, <4% is bad',
      ['Bad', 'Neither good nor bad', 'Neither good nor bad', 'Neither good nor bad', 'Good'],
    ],
    ['lower-is-better', null, '<4% is good', ['Good', 'Bad', 'Bad', 'Bad', 'Bad']],
    ['higher-is-better', null, '>4% is good', ['Bad', 'Bad', 'Good', 'Good', 'Good']],
  ] as const)('formats and judges %s with upper %s', (polarity, upper, text, verdicts) => {
    const goal: PolicyGoal = { lower: 4, upper, polarity, policyDetail: null };
    expect(goalThresholdText(goal, '%')).toBe(text);
    expect([3, 4, 5, 6, 7].map((value) => goalVerdict(value, goal))).toEqual(verdicts);
    expect(goalVerdict(null, goal)).toBe('-');
    expect(goalVerdict(undefined, goal)).toBe('-');
    expect(goalThresholds(goal)).toEqual([
      { value: polarity === 'higher-is-better' ? (upper ?? 4) : 4, colour: '#00703c' },
      ...(upper === null
        ? []
        : [{ value: polarity === 'higher-is-better' ? 4 : upper, colour: '#d4351c' }]),
    ]);
  });

  it('uses the existing number and unit formatting', () => {
    const goal: PolicyGoal = {
      lower: 1234.56,
      upper: null,
      polarity: 'lower-is-better',
      policyDetail: null,
    };
    expect(goalThresholdText(goal, 'per 100,000')).toBe('<1,234.6 per 100,000 is good');
    expect(goalThresholdText(goal, null)).toBe('<1,234.6 is good');
  });
});
