/**
 * Which way an indicator's values are better, which decides how the public site compares an
 * area with its benchmark. With no polarity the comparison says only higher or lower; with no
 * comparison possible it says nothing.
 */
export const POLARITIES = [
  'higher-is-better',
  'lower-is-better',
  'no-polarity',
  'no-comparison-possible',
] as const;

export type Polarity = (typeof POLARITIES)[number];

export const POLARITY_LABELS: Readonly<Record<Polarity, string>> = {
  'higher-is-better': 'Higher is better',
  'lower-is-better': 'Lower is better',
  'no-polarity': 'Neither is better',
  'no-comparison-possible': 'No comparison should be made',
};

/** Which way a goal is met: the indicator's own directions, since a goal always has one. */
export const GOAL_POLARITIES = [
  'higher-is-better',
  'lower-is-better',
] as const satisfies readonly Polarity[];

export type GoalPolarity = (typeof GOAL_POLARITIES)[number];

export const GOAL_POLARITY_LABELS: Readonly<Record<GoalPolarity, string>> = {
  'higher-is-better': 'High is good',
  'lower-is-better': 'Low is good',
};
