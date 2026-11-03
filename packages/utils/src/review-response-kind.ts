/**
 * What a reviewer's response to a submission says: feedback before the IMRG meeting, or the
 * meeting's decision.
 */
export const REVIEW_RESPONSE_KINDS = [
  'pre_imrg_feedback',
  'minor_revisions',
  'major_revisions',
  'approved',
] as const;

export type ReviewResponseKind = (typeof REVIEW_RESPONSE_KINDS)[number];

/** The responses that record an IMRG decision, each dated by the meeting that made it. */
export const IMRG_DECISION_KINDS = [
  'minor_revisions',
  'major_revisions',
  'approved',
] as const satisfies readonly ReviewResponseKind[];
