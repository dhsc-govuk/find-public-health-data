// No @fphd/ui imports here, so the loaders and actions unit-test without the components' jsdom.
import {
  type IndicatorAdminDetail,
  imrgReviewDateSchemaFor,
  indicatorAdminDetailSchema,
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
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';

import { requireIndicatorId } from '../indicator-id.ts';
import { RESPONSE_STEPS } from '../indicator-overview/actions-tab.ts';
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
import { REVIEWED_BEFORE_SUBMISSION, type ReviewFormState, sendReviewResponse } from './send.ts';

type Context = LoaderFunctionArgs['context'];

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

  if (!indicator.actions.some((step) => RESPONSE_STEPS.includes(step))) {
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
  const indicator = await waitingIndicator(context, id);
  const journey = journeyFrom(new URL(request.url));
  const submissionNumber = indicator.draftSubmissionNumber;

  if (submissionNumber === null) throw new Response('Not Found', { status: 404 });

  return { id, submissionNumber, values: { responseType: responseTypeFrom(journey) } };
}

export async function chooseResponseType({
  params,
  request,
}: ActionFunctionArgs): Promise<ReviewFormState<'responseType', ResponseTypeValues> | Response> {
  const id = requireIndicatorId(params);
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
  const indicator = await waitingIndicator(context, id);
  const journey = requireJourney(request, id, anyJourney);
  const { draftFirstSubmittedAt } = indicator;
  const refused =
    takeFlash(context) === REVIEWED_BEFORE_SUBMISSION && draftFirstSubmittedAt !== null;
  const message = refused ? reviewedBeforeSubmissionMessage(new Date(draftFirstSubmittedAt)) : '';

  return {
    id,
    journey,
    ...recap(indicator),
    values: dateValuesFrom(journey),
    fieldErrors: refused
      ? { imrgReviewedOnDay: message, imrgReviewedOnMonth: message, imrgReviewedOnYear: message }
      : {},
  };
}

export async function chooseReviewDate({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<ReviewFormState<keyof DateValues, DateValues> | Response> {
  const id = requireIndicatorId(params);
  const journey = requireJourney(request, id, anyJourney);
  const formData = await request.formData();
  const values = readReviewDate(formData);
  const { draftFirstSubmittedAt } = await fetchIndicator(context, id);
  const schema = imrgReviewDateSchemaFor({
    now: new Date(),
    firstSubmittedAt: draftFirstSubmittedAt === null ? null : new Date(draftFirstSubmittedAt),
  });
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
  const journey = requireJourney(request, id, dated);
  const formData = await request.formData();
  const values: ApprovalValues = {
    approved: String(formData.get('approved') ?? ''),
    revisionsKind: String(formData.get('revisionsKind') ?? ''),
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
