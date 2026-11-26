import { describe, expect, it } from 'vitest';

import {
  goalValue,
  goalValueText,
  MAX_POLICY_GOALS,
  benchmarkingSection as section,
} from './indicator-benchmarking-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const policyGoal = {
  lowerComparison: 'less-than',
  lowerValue: '90',
  upperComparison: 'more-than-or-equal',
  upperValue: '95',
  polarity: 'higher-is-better',
  detail: 'The national immunisation programme target.',
};

const blankGoal = {
  lowerComparison: '',
  lowerValue: '',
  upperComparison: '',
  upperValue: '',
  polarity: '',
  detail: '',
};

const goal = { hasGoalBenchmark: 'yes', goals: [policyGoal] };

const noGoal = { hasGoalBenchmark: 'no', goals: [blankGoal] };

/** The answers with the first goal changed. */
function withGoal(change: Partial<typeof policyGoal>) {
  return { ...goal, goals: [{ ...policyGoal, ...change }] };
}

describe('goalValue', () => {
  it.each([
    ['95', 95],
    ['0.956', 0.956],
    ['.5', 0.5],
    ['-1.5', -1.5],
    ['0', 0],
    ['2,400', 2400],
    ['1,234,567.25', 1234567.25],
  ])('reads %s as %d', (text, value) => {
    expect(goalValue(text)).toBe(value);
  });

  it.each([
    '',
    'abc',
    '95%',
    '9,5',
    '24,00',
    '1,2345',
    '0,500',
    '00,500',
    '-0,250',
    '1e3',
    '1.',
    '+5',
    '--5',
    'Infinity',
    'NaN',
    '0x10',
    '1 000',
    `1${'0'.repeat(400)}`,
  ])('refuses %s', (text) => {
    expect(goalValue(text)).toBeUndefined();
  });
});

describe('goalValueText', () => {
  it.each([
    [null, null],
    [95, '95'],
    [0.956000001, '0.956000001'],
    [-2400, '-2400'],
    [1e21, '1000000000000000000000'],
    [1.5e-7, '0.00000015'],
  ])('shows %s as %s', (value, text) => {
    expect(goalValueText(value)).toBe(text);
  });

  it.each([0.1, 0.1 + 0.2, 1e21, Number.MAX_VALUE, 5e-324, 1.5e-100, -1e-101, 1 / 3])(
    'shows %s as text that reads back as the same value',
    (value) => {
      expect(goalValue(goalValueText(value) ?? '')).toBe(value);
    },
  );
});

describe('benchmarkingSection', () => {
  it('takes a goal without the spaces around its answers', () => {
    expect(
      section.schema.parse(
        withGoal({ lowerValue: ' 90 ', upperValue: '\t95', detail: ' The target. \n' }),
      ),
    ).toEqual(withGoal({ detail: 'The target.' }));
  });

  it.each([
    ['no goal', noGoal],
    ['no goal and no goal rows', { hasGoalBenchmark: 'no', goals: [] }],
    ['a goal', goal],
    ['a single goal value', withGoal({ upperValue: '', upperComparison: '' })],
    ['a single goal value beside an upper comparison', withGoal({ upperValue: '' })],
    ['a goal without detail', withGoal({ detail: '' })],
    ['a low-is-good goal', withGoal({ polarity: 'lower-is-better' })],
    ['grouped and negative values', withGoal({ lowerValue: '-2,400', upperValue: '1,000' })],
    ['several goals', { ...goal, goals: [policyGoal, policyGoal] }],
    [
      'the most goals a draft may hold',
      { ...goal, goals: Array.from({ length: MAX_POLICY_GOALS }, () => policyGoal) },
    ],
    [
      'no goal beside answers the form hid',
      { hasGoalBenchmark: 'no', goals: [{ ...blankGoal, lowerValue: 'abc', upperValue: '1' }] },
    ],
  ])('accepts %s', (_, body) => {
    expect(sectionFieldErrors(section, body)).toBeUndefined();
  });

  it('asks whether there are goal benchmarks when nothing is answered', () => {
    expect(sectionFieldErrors(section, { ...noGoal, hasGoalBenchmark: '' })).toEqual({
      hasGoalBenchmark: 'Select whether there are any goal benchmarks for this indicator',
    });
  });

  it('asks for the comparison, lower value and polarity of a goal given none', () => {
    expect(sectionFieldErrors(section, { hasGoalBenchmark: 'yes', goals: [blankGoal] })).toEqual({
      'goals[0].lowerComparison': 'Select the comparison for the lower goal value',
      'goals[0].lowerValue': 'Enter the lower goal value',
      'goals[0].polarity': 'Select the polarity of the goal',
    });
  });

  it('refuses a yes without any goal where the first goal goes', () => {
    expect(sectionFieldErrors(section, { hasGoalBenchmark: 'yes', goals: [] })).toEqual({
      'goals[0].lowerValue': 'Enter the lower goal value',
    });
  });

  it('asks for the comparison of an upper value', () => {
    expect(sectionFieldErrors(section, withGoal({ upperComparison: '' }))).toEqual({
      'goals[0].upperComparison': 'Select the comparison for the upper goal value',
    });
  });

  it('asks for a lower value when only the upper one is given', () => {
    expect(sectionFieldErrors(section, withGoal({ lowerValue: ' ' }))).toEqual({
      'goals[0].lowerValue': 'Enter the lower goal value',
    });
  });

  it('refuses values that are not numbers', () => {
    expect(
      sectionFieldErrors(section, withGoal({ lowerValue: '90%', upperValue: 'ninety' })),
    ).toEqual({
      'goals[0].lowerValue': 'Lower goal value must be a number',
      'goals[0].upperValue': 'Upper goal value must be a number',
    });
  });

  it.each([
    ['below', '85'],
    ['equal to', '90'],
  ])('refuses an upper value %s the lower one', (_, upperValue) => {
    expect(sectionFieldErrors(section, withGoal({ upperValue }))).toEqual({
      'goals[0].upperValue': 'Upper goal value must be higher than the lower goal value',
    });
  });

  it('compares the values as numbers, not text', () => {
    expect(sectionFieldErrors(section, withGoal({ lowerValue: '9', upperValue: '10' }))).toBe(
      undefined,
    );
  });

  it('names the goal in the messages from the second goal on', () => {
    expect(
      sectionFieldErrors(section, {
        hasGoalBenchmark: 'yes',
        goals: [policyGoal, { ...blankGoal, upperValue: '5', lowerValue: '9' }],
      }),
    ).toEqual({
      'goals[1].lowerComparison':
        'Select the comparison for the lower goal value for policy goal 2',
      'goals[1].upperComparison':
        'Select the comparison for the upper goal value for policy goal 2',
      'goals[1].upperValue':
        'Upper goal value for policy goal 2 must be higher than the lower goal value',
      'goals[1].polarity': 'Select the polarity of the goal for policy goal 2',
    });
  });

  it.each([
    ['a detail too long', { detail: 'a'.repeat(10_001) }, 'detail'],
    ['a comparison the form never offers', { lowerComparison: 'more-than' }, 'lowerComparison'],
    ['a polarity the form never offers', { polarity: 'no-polarity' }, 'polarity'],
  ])('refuses the other goals beside %s on one goal', (_, change, part) => {
    const errors = sectionFieldErrors(section, {
      hasGoalBenchmark: 'yes',
      goals: [
        { ...policyGoal, lowerValue: '' },
        { ...policyGoal, ...change },
      ],
    });

    expect(errors).toMatchObject({ 'goals[0].lowerValue': 'Enter the lower goal value' });
    expect(Object.keys(errors ?? {})).toContain(`goals[1].${part}`);
  });

  it.each([
    ['goals that are not a list', { hasGoalBenchmark: 'yes', goals: 'none' }],
    ['a goal that is not an object', { hasGoalBenchmark: 'yes', goals: [policyGoal, null] }],
  ])('refuses %s without checking the goals', (_, body) => {
    expect(sectionFieldErrors(section, body)).toBeDefined();
  });

  it('refuses more goals than a draft may hold', () => {
    expect(
      sectionFieldErrors(section, {
        ...goal,
        goals: Array.from({ length: MAX_POLICY_GOALS + 1 }, () => policyGoal),
      }),
    ).toEqual({ goals: 'You cannot add more than 10 policy goals' });
  });

  it.each([
    null,
    {},
    { ...goal, hasGoalBenchmark: 'not-applicable' },
    { ...goal, hasGoalBenchmark: true },
    withGoal({ polarity: 'no-polarity' }),
    withGoal({ polarity: 'high-is-good' }),
    withGoal({ lowerComparison: 'more-than' }),
    withGoal({ upperComparison: 'less-than' }),
    { ...goal, goals: [{ ...policyGoal, lowerValue: 90 }] },
  ])('refuses %o, which the form never sends', (body) => {
    expect(sectionFieldErrors(section, body)).toBeDefined();
  });

  it('names the goal of a choice the form never offers', () => {
    expect(
      sectionFieldErrors(section, {
        ...goal,
        goals: [policyGoal, { ...policyGoal, lowerComparison: 'more-than' }],
      }),
    ).toEqual({
      'goals[1].lowerComparison':
        'Select the comparison for the lower goal value for policy goal 2',
    });
  });
});
