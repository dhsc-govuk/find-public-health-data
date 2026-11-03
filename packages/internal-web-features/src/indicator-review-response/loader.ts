// No @fphd/ui imports here, so the loaders and actions unit-test without the components' jsdom.

import { canReviewIndicators } from '@fphd/auth/permissions';
import {
  type IndicatorAdminDetail,
  imrgReviewDateSchemaFor,
  indicatorAdminDetailSchema,
  REVIEW_RESPONSE_STEPS,
  type ReviewResponseField,
  reviewApprovalSchema,
  reviewedBeforeSubmissionMessage,
  reviewResponseFieldSchema,
  reviewResponseSchemaFor,
  reviewResponseTypeSchema,
  toFieldErrors,
} from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { takeFlash } from '@fphd/web-server/flash';
import { getSession } from '@fphd/web-server/session';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';

import { requireIndicatorId } from '../indicator-id.ts';
import { setOverviewFlash } from '../indicator-overview/notifications.ts';
import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import {
  type ApprovalValues,
  approvalValuesFrom,
  type DateValues,
  dateValuesFrom,
  type ResponseTypeValues,
  type RevisionsValues,
  readReviewDate,
  readRevisions,
  responseTypeFrom,
  revisionsBody,
} from './form.ts';
import { reviewResponsePath } from './paths.ts';
import { isRevisionsJourney, journeyFrom, journeySearch, type ReviewJourney } from './query.ts';
import { REVIEW_DATE_REFUSED, type ReviewFormState, sendReviewResponse } from './send.ts';

type Context = LoaderFunctionArgs['context'];

/** The pages do not exist for a user who may not review, as the API's 403 means. */
function requireReviewer(context: Context): void {
  const session = getSession(context);

  if (session === undefined || !canReviewIndicators(session)) {
    throw new Response('Not Found', { status: 404 });
  }
}

function fetchIndicator(context: Context, id: string): Promise<IndicatorAdminDetail> {
  return context
    .get(apiContext)
    .get(apiPath`/api/internal/indicators/${id}`, indicatorAdminDetailSchema);
}

/**
 * The indicator, while the user may still respond to it. Once they may not, because the round was
 * answered or withdrawn, the overview says so.
 */
async function waitingIndicator(context: Context, id: string): Promise<IndicatorAdminDetail> {
  const indicator = await fetchIndicator(context, id);

  if (!indicator.actions.some((step) => REVIEW_RESPONSE_STEPS.includes(step))) {
    setOverviewFlash(context, 'review-not-waiting');
    throw redirect(indicatorOverviewPath(id));
  }

  return indicator;
}

/** The journey the address carries, or back to the first page when it carries none this page can use. */
function requireJourney<Usable extends ReviewJourney>(
  request: Request,
  id: string,
  usable: (journey: ReviewJourney) => journey is Usable,
): Usable {
  const journey = journeyFrom(new URL(request.url));

  if (journey === undefined || !usable(journey)) {
    throw redirect(reviewResponsePath(id, 'response-type'));
  }

  return journey;
}

const anyJourney = (journey: ReviewJourney): journey is ReviewJourney => journey !== undefined;

const dated = (journey: ReviewJourney): journey is ReviewJourney & { imrgReviewedOn: string } =>
  journey.imrgReviewedOn !== undefined;

/** What the pages that recap the indicator show of it. */
function recap({ name, draftScheduledPublishAt }: IndicatorAdminDetail) {
  return { name, scheduledPublishAt: draftScheduledPublishAt };
}

export async function loadResponseType({ context, params, request }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  requireReviewer(context);
  const indicator = await waitingIndicator(context, id);
  const journey = journeyFrom(new URL(request.url));
  const submissionNumber = indicator.draftSubmissionNumber;

  if (submissionNumber === null) throw new Response('Not Found', { status: 404 });

  return { id, submissionNumber, values: { responseType: responseTypeFrom(journey) } };
}

export async function chooseResponseType({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<ReviewFormState<'responseType', ResponseTypeValues> | Response> {
  const id = requireIndicatorId(params);
  requireReviewer(context);
  const formData = await request.formData();
  const submission = formData.get('submissionNumber');
  const responseType = formData.get('responseType');
  const values = { responseType: typeof responseType === 'string' ? responseType : '' };

  if (typeof submission !== 'string' || !/^[1-9]\d*$/.test(submission)) {
    throw new Response('Bad Request', { status: 400 });
  }

  const chosen = reviewResponseTypeSchema.safeParse(values);

  if (!chosen.success) {
    return { values, fieldErrors: toFieldErrors(chosen.error, reviewResponseTypeSchema.keyof()) };
  }

  const submissionNumber = Number(submission);

  return chosen.data.responseType === 'pre_imrg_feedback'
    ? redirect(
        reviewResponsePath(
          id,
          'revisions',
          journeySearch({ submissionNumber, kind: 'pre_imrg_feedback' }),
        ),
      )
    : redirect(reviewResponsePath(id, 'date', journeySearch({ submissionNumber })));
}

export async function loadReviewDate({ context, params, request }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  requireReviewer(context);
  const indicator = await waitingIndicator(context, id);
  const journey = requireJourney(request, id, anyJourney);
  const values = dateValuesFrom(journey);

  return {
    id,
    journey,
    ...recap(indicator),
    values,
    fieldErrors:
      takeFlash(context) === REVIEW_DATE_REFUSED ? refusedDateErrors(values, indicator) : {},
  };
}

/** The date rules' schema, as the date page and its loader apply them today. */
function reviewDateSchema({ draftFirstSubmittedAt }: IndicatorAdminDetail) {
  return imrgReviewDateSchemaFor({
    now: new Date(),
    firstSubmittedAt: draftFirstSubmittedAt === null ? null : new Date(draftFirstSubmittedAt),
  });
}

/**
 * Why the API refused the date the journey carries: the date rules again, or else the one rule
 * only the API applies under the draft's lock, a date before the version's first submission.
 */
function refusedDateErrors(
  values: DateValues,
  indicator: IndicatorAdminDetail,
): Partial<Record<keyof DateValues, string>> {
  const schema = reviewDateSchema(indicator);
  const checked = schema.safeParse(values);

  if (!checked.success) return toFieldErrors(checked.error, schema.in.keyof());

  const { draftFirstSubmittedAt } = indicator;
  if (draftFirstSubmittedAt === null) return {};

  const message = reviewedBeforeSubmissionMessage(new Date(draftFirstSubmittedAt));
  return { imrgReviewedOnDay: message, imrgReviewedOnMonth: message, imrgReviewedOnYear: message };
}

export async function chooseReviewDate({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<ReviewFormState<keyof DateValues, DateValues> | Response> {
  const id = requireIndicatorId(params);
  requireReviewer(context);
  const journey = requireJourney(request, id, anyJourney);
  const formData = await request.formData();
  const values = readReviewDate(formData);
  const schema = reviewDateSchema(await fetchIndicator(context, id));
  const date = schema.safeParse(values);

  if (!date.success) {
    return { values, fieldErrors: toFieldErrors(date.error, schema.in.keyof()) };
  }

  const next = {
    submissionNumber: journey.submissionNumber,
    imrgReviewedOn: date.data.imrgReviewedOn,
  };
  return redirect(reviewResponsePath(id, 'approval', journeySearch(next)));
}

export async function loadApproval({ context, params, request }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  requireReviewer(context);
  const indicator = await waitingIndicator(context, id);
  const journey = requireJourney(request, id, dated);

  return { id, journey, ...recap(indicator), values: approvalValuesFrom(journey) };
}

export async function chooseApproval({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<ReviewFormState<keyof ApprovalValues, ApprovalValues> | Response> {
  const id = requireIndicatorId(params);
  requireReviewer(context);
  const journey = requireJourney(request, id, dated);
  const formData = await request.formData();
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };
  const values: ApprovalValues = {
    approved: text('approved'),
    revisionsKind: text('revisionsKind'),
  };
  const decision = reviewApprovalSchema.safeParse({
    approved: values.approved || undefined,
    revisionsKind: values.revisionsKind || undefined,
  });

  if (!decision.success) {
    return {
      values,
      fieldErrors: toFieldErrors(decision.error, reviewApprovalSchema.in.keyof()),
    };
  }

  const { kind } = decision.data;

  if (kind !== 'approved') {
    return redirect(reviewResponsePath(id, 'revisions', journeySearch({ ...journey, kind })));
  }

  const sent = await sendReviewResponse(context, id, journey, {
    submissionNumber: journey.submissionNumber,
    kind,
    imrgReviewedOn: journey.imrgReviewedOn,
    clarificationRequest: null,
    flags: [],
  });

  return sent instanceof Response ? sent : { values, ...sent };
}

export async function loadRevisions({ context, params, request }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  requireReviewer(context);
  await waitingIndicator(context, id);
  const journey = requireJourney(request, id, isRevisionsJourney);

  return { id, journey, values: readRevisions(new FormData()) };
}

export async function sendRevisions({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<ReviewFormState<ReviewResponseField, RevisionsValues> | Response> {
  const id = requireIndicatorId(params);
  requireReviewer(context);
  const journey = requireJourney(request, id, isRevisionsJourney);
  const values = readRevisions(await request.formData());
  const body = revisionsBody(journey, values);
  const checked = reviewResponseSchemaFor(new Date()).safeParse(body);

  if (!checked.success) {
    return { values, fieldErrors: toFieldErrors(checked.error, reviewResponseFieldSchema) };
  }

  const sent = await sendReviewResponse(context, id, journey, body);

  return sent instanceof Response ? sent : { values, ...sent };
}
