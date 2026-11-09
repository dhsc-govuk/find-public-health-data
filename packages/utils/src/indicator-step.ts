/**
 * The workflow steps a draft version can take, from submission through review to publication, in
 * the order the workflow allows them.
 */
export const INDICATOR_STEPS = [
  'submit',
  'withdraw',
  'assign_reviewers',
  'give_feedback',
  'request_changes',
  'approve',
  'resubmit',
  'schedule',
  'change_publication_date',
  'publish',
] as const;

export type IndicatorStep = (typeof INDICATOR_STEPS)[number];
