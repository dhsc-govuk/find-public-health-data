import { formatValue, withUnit } from './data.ts';
import type { IndicatorDetail } from './loader.ts';

export type PolicyGoal = NonNullable<IndicatorDetail['goal']>;

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
  const value = (number: number) => withUnit(formatValue(number), unit);
  return goal.polarity === 'lower-is-better'
    ? `<${value(goal.lower)} is good${goal.upper === null ? '' : `, >${value(goal.upper)} is bad`}`
    : `>${value(goal.upper ?? goal.lower)} is good${goal.upper === null ? '' : `, <${value(goal.lower)} is bad`}`;
}

export function goalVerdict(value: number | null | undefined, goal: PolicyGoal): string {
  if (value == null) return '-';
  if (goal.polarity === 'lower-is-better') {
    if (value < goal.lower) return 'Good';
    if (goal.upper === null || value > goal.upper) return 'Bad';
  } else {
    if (value > (goal.upper ?? goal.lower)) return 'Good';
    if (goal.upper === null || value < goal.lower) return 'Bad';
  }
  return 'Neither good nor bad';
}
