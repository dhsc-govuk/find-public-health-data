/**
 * What the core team decides should happen to a submitted update to a live indicator: send it to
 * IMRG for review, send it back for revisions, or publish it, with or without an entry in its
 * public history.
 */
export const UPDATE_DECISIONS = [
  'imrg_review',
  'request_revisions',
  'publish_with_history',
  'publish_without_history',
] as const;

export type UpdateDecision = (typeof UPDATE_DECISIONS)[number];
