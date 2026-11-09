/**
 * Whether the public can see the indicator. It is 'new' until its first version is published,
 * and 'live' from then on.
 */
export const INDICATOR_STATUSES = ['new', 'live'] as const;

export type IndicatorStatus = (typeof INDICATOR_STATUSES)[number];
