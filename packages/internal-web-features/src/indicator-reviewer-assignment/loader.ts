// No @fphd/ui imports here, so the loader and action unit-test without the components' jsdom.
import { canAssignReviewers } from '@fphd/auth/permissions';
import {
  type IndicatorAssignReviewersError,
  indicatorAdminDetailSchema,
  indicatorAssignReviewersErrorSchema,
  reviewerOptionsSchema,
} from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { getSession } from '@fphd/web-server/session';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';

import { formRefusal } from '../form-refusal.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { type OverviewFlash, setOverviewFlash } from '../indicator-overview/notifications.ts';
import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import { withListFocus } from '../list-form.ts';
import {
  type ReviewerAssignmentState,
  type ReviewerAssignmentValues,
  readReviewerAssignmentForm,
  SELECT_A_REVIEWER,
  withChosenReviewerTakenIn,
  withReviewerAdded,
  withReviewerRemoved,
} from './form.ts';

/** The refusals of a page gone stale, each told on the overview, where the page reopens fresh. */
const STALE: Partial<Record<IndicatorAssignReviewersError['error'], OverviewFlash>> = {
  not_allowed: 'assign-refused',
  changed: 'reviewers-changed',
  not_a_reviewer: 'reviewer-refused',
};

/** The page does not exist for a user who may not assign reviewers, as the API's 403 means. */
function requireReviewerAssigner(context: LoaderFunctionArgs['context']): void {
  const session = getSession(context);

  if (session === undefined || !canAssignReviewers(session)) {
    throw new Response('Not Found', { status: 404 });
  }
}

/**
 * The reviewers on offer and those assigned now, which the page opens with. A draft never
 * submitted has no submission, so the page does not exist; one the workflow no longer lets the
 * manager assign sends them to the overview, which says so.
 */
export async function loadReviewerAssignment({ context, params }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);

  requireReviewerAssigner(context);

  const api = context.get(apiContext);
  const [indicator, { reviewers: options }] = await Promise.all([
    api.get(apiPath`/api/internal/indicators/${id}`, indicatorAdminDetailSchema),
    api.get(apiPath`/api/internal/indicators/${id}/reviewer-options`, reviewerOptionsSchema),
  ]);
  const { draftReviewers, draftSubmissionNumber } = indicator;

  if (draftSubmissionNumber === null) throw new Response('Not Found', { status: 404 });

  if (!indicator.actions.includes('assign_reviewers')) {
    setOverviewFlash(context, 'assign-refused');
    throw redirect(indicatorOverviewPath(id));
  }

  const reviewerIds = draftReviewers.map((reviewer) => reviewer.id);
  const values: ReviewerAssignmentValues = {
    submissionNumber: draftSubmissionNumber,
    previousReviewerIds: reviewerIds,
    reviewerIds,
    addReviewer: '',
  };

  return { id, options, currentReviewers: draftReviewers, values };
}

/**
 * Add and each Remove change the list and re-render the page without saving. Continue assigns
 * the listed reviewers and returns to the overview, which says whether they were assigned.
 */
export async function assignReviewers({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<ReviewerAssignmentState | Response> {
  const id = requireIndicatorId(params);

  requireReviewerAssigner(context);

  const { intent, values } = readReviewerAssignmentForm(await request.formData());

  if (intent.to !== 'continue') {
    const changed =
      intent.to === 'add' ? withReviewerAdded(values) : withReviewerRemoved(values, intent.index);
    return withListFocus(changed, intent, 'picker', changed.values.reviewerIds.length);
  }

  const taken = withChosenReviewerTakenIn(values);

  if (taken.fieldErrors.addReviewer !== undefined) return taken;

  const { submissionNumber, previousReviewerIds, reviewerIds } = taken.values;
  const result = await context
    .get(apiContext)
    .postToMember(
      apiPath`/api/internal/indicators/${id}/assign-reviewers`,
      { submissionNumber, previousReviewerIds, reviewerIds },
      indicatorAssignReviewersErrorSchema,
    );

  if (result.ok) {
    setOverviewFlash(context, 'reviewers-assigned');
    return redirect(indicatorOverviewPath(id));
  }

  const stale = STALE[result.error.error];

  if (stale !== undefined) {
    setOverviewFlash(context, stale);
    return redirect(indicatorOverviewPath(id));
  }

  return result.error.error === 'no_reviewers'
    ? { values: taken.values, fieldErrors: { addReviewer: SELECT_A_REVIEWER } }
    : { values: taken.values, ...formRefusal(result.error) };
}
