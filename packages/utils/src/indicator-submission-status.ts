/** Where a submission of a version for review stands. */
export const INDICATOR_SUBMISSION_STATUSES = [
  'submitted',
  'withdrawn',
  'in_review',
  'changes_requested',
  'approved',
] as const;

export type IndicatorSubmissionStatus = (typeof INDICATOR_SUBMISSION_STATUSES)[number];
