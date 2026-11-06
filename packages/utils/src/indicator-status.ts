/** What the public has: live once any version is published, new until then. */
export const INDICATOR_STATUSES = ['new', 'live'] as const;

export type IndicatorStatus = (typeof INDICATOR_STATUSES)[number];
