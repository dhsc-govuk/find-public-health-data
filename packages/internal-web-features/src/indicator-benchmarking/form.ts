import {
  type BenchmarkingFormValues,
  type BenchmarkingPageField,
  MAX_POLICY_GOALS,
  POLICY_GOAL_PARTS,
  type PolicyGoalFormValues,
  policyGoalFieldName,
} from '@fphd/internal-api-features/contract';

import { readFormValues } from '../form-values.ts';
import type { FormFailure } from '../indicator-section.ts';
import { type ListIntent, readListIntent, readListItems } from '../list-form.ts';

/** The page as the action re-renders it: after a refusal, or with a goal added or removed. */
export type BenchmarkingPageState = FormFailure<BenchmarkingPageField, BenchmarkingFormValues>;

const BLANK_POLICY_GOAL: PolicyGoalFormValues = {
  lowerComparison: '',
  lowerValue: '',
  upperComparison: '',
  upperValue: '',
  polarity: '',
  detail: '',
};

/** The answers with a blank goal if they hold none, as the page always offers one. */
export function withPolicyGoalShown(values: BenchmarkingFormValues): BenchmarkingFormValues {
  return values.goals.length > 0 ? values : { ...values, goals: [BLANK_POLICY_GOAL] };
}

/** The form as sent, and which of its buttons sent it; a field not sent is empty. */
export function readBenchmarkingForm(formData: FormData): {
  values: BenchmarkingFormValues;
  intent: ListIntent;
} {
  return {
    values: {
      ...readFormValues(formData, ['hasGoalBenchmark']),
      goals: readListItems(formData, POLICY_GOAL_PARTS, policyGoalFieldName),
    },
    intent: readListIntent(formData),
  };
}

/**
 * The page with a blank goal after the others, up to as many as a draft may hold. Adding a goal
 * answers Yes, which a form without JavaScript may not have chosen.
 */
export function withPolicyGoalAdded(values: BenchmarkingFormValues): BenchmarkingPageState {
  const goals =
    values.goals.length < MAX_POLICY_GOALS ? [...values.goals, BLANK_POLICY_GOAL] : values.goals;

  return { values: { ...values, hasGoalBenchmark: 'yes', goals }, fieldErrors: {} };
}

/** The page without the goal at `index`, keeping everything typed elsewhere. */
export function withPolicyGoalRemoved(
  values: BenchmarkingFormValues,
  index: number,
): BenchmarkingPageState {
  const goals = values.goals.filter((_, at) => at !== index);

  return { values: withPolicyGoalShown({ ...values, goals }), fieldErrors: {} };
}
