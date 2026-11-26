import {
  type BenchmarkingFormValues,
  MAX_POLICY_GOALS,
  type PolicyGoalFormValues,
} from '@fphd/internal-api-features/contract';
import { describe, expect, it } from 'vitest';

import { withPolicyGoalAdded, withPolicyGoalRemoved, withPolicyGoalShown } from './form.ts';

const blank: PolicyGoalFormValues = {
  lowerComparison: '',
  lowerValue: '',
  upperComparison: '',
  upperValue: '',
  polarity: '',
  detail: '',
};
const ten = { ...blank, lowerComparison: 'less-than', lowerValue: '10' };
const twenty = { ...blank, lowerComparison: 'less-than', lowerValue: '20' };

const empty: BenchmarkingFormValues = { hasGoalBenchmark: '', goals: [] };

describe('withPolicyGoalShown', () => {
  it('offers a blank goal only where there is none', () => {
    expect(withPolicyGoalShown(empty).goals).toEqual([blank]);
    expect(withPolicyGoalShown({ ...empty, goals: [ten] }).goals).toEqual([ten]);
  });
});

describe('withPolicyGoalAdded', () => {
  it('adds a blank goal after the others and answers Yes', () => {
    expect(withPolicyGoalAdded({ hasGoalBenchmark: 'no', goals: [ten] })).toEqual({
      values: { hasGoalBenchmark: 'yes', goals: [ten, blank] },
      fieldErrors: {},
    });
  });

  it('adds none beyond as many as a draft may hold', () => {
    const goals = Array.from({ length: MAX_POLICY_GOALS }, () => ten);

    expect(withPolicyGoalAdded({ ...empty, goals }).values.goals).toHaveLength(MAX_POLICY_GOALS);
  });
});

describe('withPolicyGoalRemoved', () => {
  it('removes only the goal at the index, keeping the others in order', () => {
    expect(
      withPolicyGoalRemoved({ ...empty, goals: [ten, blank, twenty] }, 1).values.goals,
    ).toEqual([ten, twenty]);
  });

  it('leaves a blank goal after removing the last one', () => {
    expect(withPolicyGoalRemoved({ ...empty, goals: [ten] }, 0).values.goals).toEqual([blank]);
  });
});
