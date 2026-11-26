import type { GoalPolarity } from './polarity.ts';

/**
 * A policy goal splits the values into bands. The lower value bounds the band below it, and its
 * comparison says whether the lower value itself is in that band. The upper value, where there is
 * one, bounds the band above it in the same way. The goal's polarity says which band is good.
 * Values in neither band are neither good nor bad.
 */
export const GOAL_LOWER_COMPARISONS = ['less-than', 'less-than-or-equal'] as const;

export type GoalLowerComparison = (typeof GOAL_LOWER_COMPARISONS)[number];

/** How the upper value bounds the band above it. */
export const GOAL_UPPER_COMPARISONS = ['more-than', 'more-than-or-equal'] as const;

export type GoalUpperComparison = (typeof GOAL_UPPER_COMPARISONS)[number];

export const GOAL_COMPARISON_LABELS: Readonly<
  Record<GoalLowerComparison | GoalUpperComparison, string>
> = {
  'less-than': 'Less than',
  'less-than-or-equal': 'Less than or equal to',
  'more-than': 'More than',
  'more-than-or-equal': 'More than or equal to',
};

/** The parts of a policy goal that decide whether a value meets it. */
export interface PolicyGoalBands {
  lower: number;
  lowerComparison: GoalLowerComparison;
  /** Null for a goal with a single value. */
  upper: number | null;
  upperComparison: GoalUpperComparison | null;
  polarity: GoalPolarity;
}

export type GoalVerdict = 'good' | 'bad' | 'neither';

function isInLowerBand(value: number, goal: PolicyGoalBands): boolean {
  return goal.lowerComparison === 'less-than' ? value < goal.lower : value <= goal.lower;
}

function isInUpperBand(value: number, goal: PolicyGoalBands): boolean {
  if (goal.upper === null) return false;
  return goal.upperComparison === 'more-than-or-equal' ? value >= goal.upper : value > goal.upper;
}

/**
 * Whether a value meets the goal. A goal with a single value has only the lower band, and every
 * value outside it is in the other band.
 */
export function goalVerdict(value: number, goal: PolicyGoalBands): GoalVerdict {
  const lowIsGood = goal.polarity === 'lower-is-better';

  if (isInLowerBand(value, goal)) return lowIsGood ? 'good' : 'bad';
  if (goal.upper === null || isInUpperBand(value, goal)) return lowIsGood ? 'bad' : 'good';
  return 'neither';
}

/**
 * The goal's bands in a few words, the good one first, such as "≥20 is good, <10 is bad".
 * `format` writes each value, so a page can add its unit.
 */
export function goalBandsText(goal: PolicyGoalBands, format: (value: number) => string): string {
  const lowerSign = goal.lowerComparison === 'less-than' ? '<' : '≤';
  const lowIsGood = goal.polarity === 'lower-is-better';
  const lowerBand = `${lowerSign}${format(goal.lower)}`;

  if (goal.upper === null) {
    // The values outside the lower band, as the other side of the same boundary.
    const otherSign = goal.lowerComparison === 'less-than' ? '≥' : '>';
    return lowIsGood ? `${lowerBand} is good` : `${otherSign}${format(goal.lower)} is good`;
  }

  const upperSign = goal.upperComparison === 'more-than-or-equal' ? '≥' : '>';
  const upperBand = `${upperSign}${format(goal.upper)}`;
  return lowIsGood
    ? `${lowerBand} is good, ${upperBand} is bad`
    : `${upperBand} is good, ${lowerBand} is bad`;
}
