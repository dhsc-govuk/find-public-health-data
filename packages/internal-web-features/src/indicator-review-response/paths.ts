import { indicatorOverviewPath } from '../indicator-overview/paths.ts';

/** The pages of a reviewer's response, in the order the journey may visit them. */
export type ReviewResponsePage = 'response-type' | 'date' | 'approval' | 'revisions';

/** A page of the reviewer's response, with `search` carrying the answers so far. */
export function reviewResponsePath(id: string, page: ReviewResponsePage, search = ''): string {
  return `${indicatorOverviewPath(id)}/review/${page}${search}`;
}
