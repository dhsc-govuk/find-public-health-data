// No @fphd/ui imports here, so the actions unit-test without the components' jsdom.
import {
  type ReviewResponseBody,
  type ReviewResponseError,
  type ReviewResponseKind,
  reviewResponseErrorSchema,
} from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { setFlash } from '@fphd/web-server/flash';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import { setDashboardFlash } from '../dashboard/notifications.ts';
import { DASHBOARD_PATH } from '../dashboard/paths.ts';
import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { type OverviewFlash, setOverviewFlash } from '../indicator-overview/notifications.ts';
import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import { reviewResponsePath } from './paths.ts';
import { journeySearch, type ReviewJourney } from './query.ts';

type Context = LoaderFunctionArgs['context'];

/** A page as its action re-renders it after a refusal. */
export interface ReviewFormState<Field extends string, Values> {
  values: Values;
  fieldErrors: Partial<Record<Field, string>>;
  formError?: string | undefined;
}

/** The flash that takes the reviewer back to the date page when the API refuses the date. */
export const REVIEWED_BEFORE_SUBMISSION = 'reviewed-before-submission';

const SENT: Readonly<Record<ReviewResponseKind, OverviewFlash>> = {
  pre_imrg_feedback: 'review-feedback-given',
  minor_revisions: 'review-minor-revisions',
  major_revisions: 'review-major-revisions',
  approved: 'review-approved',
};

/** The refusals of a journey gone stale, each told on the overview. */
const STALE: Partial<Record<ReviewResponseError['error'], OverviewFlash>> = {
  not_allowed: 'review-not-waiting',
  changed: 'review-changed',
  no_publication_date: 'review-no-publication-date',
};

function noLongerReviewer(context: Context): Response {
  setDashboardFlash(context, 'no-longer-reviewer');
  return redirect(DASHBOARD_PATH);
}

/**
 * Posts the response and answers where the reviewer goes next: the overview, which says what was
 * sent or why it no longer could be; the dashboard for a reviewer no longer assigned; the date
 * page for a date the API refused; or the page again, with the fields at fault. A 403, for a
 * reviewer removed who may still see the indicator, falls to the error page as every refused
 * write does.
 */
export async function sendReviewResponse(
  context: Context,
  id: string,
  journey: ReviewJourney,
  body: ReviewResponseBody,
): Promise<Response | Omit<ReviewFormState<string, never>, 'values'>> {
  let result: Awaited<ReturnType<typeof post>>;

  try {
    result = await post(context, id, body);
  } catch (error) {
    if (error instanceof Response && error.status === 404) return noLongerReviewer(context);
    throw error;
  }

  if (result.ok) {
    setOverviewFlash(context, SENT[body.kind]);
    return redirect(indicatorOverviewPath(id));
  }

  const refusal = result.error;

  if (refusal.error === 'not_a_reviewer') return noLongerReviewer(context);

  const stale = STALE[refusal.error];

  if (stale !== undefined) {
    setOverviewFlash(context, stale);
    return redirect(indicatorOverviewPath(id));
  }

  if (refusal.error === 'validation_failed') {
    if (refusal.fieldErrors.imrgReviewedOn !== undefined) {
      setFlash(context, REVIEWED_BEFORE_SUBMISSION);
      const back = {
        submissionNumber: journey.submissionNumber,
        imrgReviewedOn: journey.imrgReviewedOn,
      };
      return redirect(reviewResponsePath(id, 'date', journeySearch(back)));
    }
    return { fieldErrors: refusal.fieldErrors };
  }

  return { fieldErrors: {}, formError: FORM_NOT_SAVED };
}

function post(context: Context, id: string, body: ReviewResponseBody) {
  return context
    .get(apiContext)
    .postToMember(
      apiPath`/api/internal/indicators/${id}/review-response`,
      body,
      reviewResponseErrorSchema,
    );
}
