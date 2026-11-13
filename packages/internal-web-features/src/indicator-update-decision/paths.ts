import { indicatorOverviewPath } from '../indicator-overview/paths.ts';

/**
 * "What should happen to this update?", where the core team decides. `decision` reopens the page
 * with that answer chosen, as the revisions page's back link does.
 */
export function updateDecisionPath(id: string, decision?: string): string {
  const path = `${indicatorOverviewPath(id)}/update-decision`;
  return decision === undefined ? path : `${path}?${new URLSearchParams({ decision })}`;
}

/** What the core team asks to revise or clarify, on the submission it was shown. */
export function updateRevisionsPath(id: string, submissionNumber: number): string {
  const search = new URLSearchParams({ submission: String(submissionNumber) });
  return `${indicatorOverviewPath(id)}/update-decision/revisions?${search}`;
}
