import { indicatorOverviewPath } from '../indicator-overview/paths.ts';

/**
 * The pages of a reviewer's response, in the order the journey may visit them. A response to an
 * update starts on its own approval page and may go on to the revisions page.
 */
export type ReviewResponsePage =
  | 'response-type'
  | 'date'
  | 'approval'
  | 'update-approval'
  | 'revisions';

/** A page of the reviewer's response, with `search` carrying the answers so far. */
export function reviewResponsePath(id: string, page: ReviewResponsePage, search = ''): string {
  return `${indicatorOverviewPath(id)}/review/${page}${search}`;
}
