import { goalBandsText, goalVerdict as verdictOf } from '@fphd/utils/policy-goal';

import { formatValue, withUnit } from './data.ts';
import type { IndicatorDetail } from './loader.ts';

export type PolicyGoal = NonNullable<IndicatorDetail['goal']>;

const VERDICT_LABELS = { good: 'Good', bad: 'Bad', neither: 'Neither good nor bad' } as const;

export function goalThresholds(goal: PolicyGoal): { value: number; colour: string }[] {
  const higher = goal.polarity === 'higher-is-better';
  return [
    { value: higher ? (goal.upper ?? goal.lower) : goal.lower, colour: '#00703c' },
    ...(goal.upper === null
      ? []
      : [{ value: higher ? goal.lower : goal.upper, colour: '#d4351c' }]),
  ];
}

export function goalThresholdText(goal: PolicyGoal, unit: string | null): string {
  return goalBandsText(goal, (number) => withUnit(formatValue(number), unit));
}

export function goalVerdict(value: number | null | undefined, goal: PolicyGoal): string {
  return value == null ? '-' : VERDICT_LABELS[verdictOf(value, goal)];
}
