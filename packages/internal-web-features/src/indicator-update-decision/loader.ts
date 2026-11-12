// No @fphd/ui imports here, so the loaders and actions unit-test without the components' jsdom.
import { canDecideUpdates } from '@fphd/auth/permissions';
import {
  type IndicatorAdminDetail,
  indicatorAdminDetailSchema,
  type ReviewResponseField,
  reviewResponseFieldSchema,
  reviewResponseSchemaFor,
  toFieldErrors,
  UPDATE_DECISION_STEPS,
  type UpdateDecisionBody,
  type UpdateDecisionError,
  updateDecisionChoiceSchema,
  updateDecisionErrorSchema,
  updateDecisionSchema,
} from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { getSession } from '@fphd/web-server/session';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';

import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { type OverviewFlash, setOverviewFlash } from '../indicator-overview/notifications.ts';
import {
  indicatorOverviewPath,
  indicatorPublicationDatePath,
} from '../indicator-overview/paths.ts';
import {
  type RevisionsValues,
  readRevisions,
  revisionsBody,
} from '../indicator-review-response/form.ts';
import { journeyFrom } from '../indicator-review-response/query.ts';
import type { ReviewFormState } from '../indicator-review-response/send.ts';
import { updateDecisionPath, updateRevisionsPath } from './paths.ts';

type Context = LoaderFunctionArgs['context'];

export interface DecisionValues {
  updateDecision: string;
}

/** The pages do not exist for a user who may not decide on updates, as the API's 403 means. */
function requireDecider(context: Context): void {
  const session = getSession(context);

  if (session === undefined || !canDecideUpdates(session)) {
    throw new Response('Not Found', { status: 404 });
  }
}

function toOverview(context: Context, id: string, flash: OverviewFlash): Response {
  setOverviewFlash(context, flash);
  return redirect(indicatorOverviewPath(id));
}

/**
 * The update, while it waits for the core team's decision. Once it does not, because someone
 * decided or the publisher withdrew it, the overview says so.
 */
async function waitingUpdate(context: Context, id: string): Promise<IndicatorAdminDetail> {
  const indicator = await context
    .get(apiContext)
    .get(apiPath`/api/internal/indicators/${id}`, indicatorAdminDetailSchema);

  if (!indicator.actions.some((step) => UPDATE_DECISION_STEPS.includes(step))) {
    throw toOverview(context, id, 'update-decision-not-waiting');
  }

  return indicator;
}

/** Where the core team goes once its decision is recorded. */
function decided(context: Context, id: string, { decision }: UpdateDecisionBody): Response {
  switch (decision) {
    case 'imrg_review':
      return redirect(indicatorOverviewPath(id));
    case 'request_revisions':
      return toOverview(context, id, 'update-revisions-requested');
    case 'publish_with_history':
    case 'publish_without_history':
      return redirect(indicatorPublicationDatePath(id));
  }
}

const STALE: Partial<Record<UpdateDecisionError['error'], OverviewFlash>> = {
  not_allowed: 'update-decision-not-waiting',
  changed: 'update-decision-changed',
};

/**
 * Posts the decision and answers where the core team goes next: the overview, the publication
 * date page for a decision to publish, or the page again with the fields at fault.
 */
async function sendDecision(
  context: Context,
  id: string,
  body: UpdateDecisionBody,
): Promise<Response | Omit<ReviewFormState<ReviewResponseField, never>, 'values'>> {
  let result: Awaited<ReturnType<typeof post>>;

  try {
    result = await post(context, id, body);
  } catch (error) {
    // No draft is left to decide on, as when the publisher withdrew it and it was published.
    if (error instanceof Response && error.status === 404) {
      return toOverview(context, id, 'update-decision-not-waiting');
    }
    throw error;
  }

  if (result.ok) return decided(context, id, body);

  const refusal = result.error;
  const stale = STALE[refusal.error];

  if (stale !== undefined) return toOverview(context, id, stale);
  if (refusal.error === 'validation_failed') return { fieldErrors: refusal.fieldErrors };
  return { fieldErrors: {}, formError: FORM_NOT_SAVED };
}

function post(context: Context, id: string, body: UpdateDecisionBody) {
  return context
    .get(apiContext)
    .postToMember(
      apiPath`/api/internal/indicators/${id}/update-decision`,
      body,
      updateDecisionErrorSchema,
    );
}

function submissionNumberFrom(formData: FormData): number {
  const submission = formData.get('submissionNumber');

  if (typeof submission !== 'string' || !/^[1-9]\d*$/.test(submission)) {
    throw new Response('Bad Request', { status: 400 });
  }

  return Number(submission);
}

export async function loadUpdateDecision({ context, params, request }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  requireDecider(context);
  const { draftSubmissionNumber } = await waitingUpdate(context, id);

  if (draftSubmissionNumber === null) throw new Response('Not Found', { status: 404 });

  const chosen = updateDecisionSchema.safeParse(new URL(request.url).searchParams.get('decision'));

  return {
    id,
    submissionNumber: draftSubmissionNumber,
    values: { updateDecision: chosen.data ?? '' },
  };
}

/**
 * Records the decision chosen, except for revisions, which go on to the page that asks what to
 * revise and record the decision from there.
 */
export async function chooseUpdateDecision({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<ReviewFormState<keyof DecisionValues, DecisionValues> | Response> {
  const id = requireIndicatorId(params);
  requireDecider(context);
  const formData = await request.formData();
  const submissionNumber = submissionNumberFrom(formData);
  const updateDecision = formData.get('updateDecision');
  const values = { updateDecision: typeof updateDecision === 'string' ? updateDecision : '' };
  const chosen = updateDecisionChoiceSchema.safeParse(values);

  if (!chosen.success) {
    return { values, fieldErrors: toFieldErrors(chosen.error, updateDecisionChoiceSchema.keyof()) };
  }

  const decision = chosen.data.updateDecision;

  if (decision === 'request_revisions') {
    return redirect(updateRevisionsPath(id, submissionNumber));
  }

  const sent = await sendDecision(context, id, { submissionNumber, decision });

  return sent instanceof Response ? sent : { values, formError: sent.formError, fieldErrors: {} };
}

/** The submission the revisions page was opened for, or back to the decision page without one. */
function requireSubmissionNumber(request: Request, id: string): number {
  const submissionNumber = journeyFrom(new URL(request.url))?.submissionNumber;

  if (submissionNumber === undefined) throw redirect(updateDecisionPath(id));

  return submissionNumber;
}

export async function loadUpdateRevisions({ context, params, request }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  requireDecider(context);
  await waitingUpdate(context, id);
  const submissionNumber = requireSubmissionNumber(request, id);

  return { id, submissionNumber, values: readRevisions(new FormData()) };
}

/**
 * Sends the update back for revisions with what is ticked, each with its text, under the same
 * rules as a reviewer's feedback before IMRG review.
 */
export async function sendUpdateRevisions({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<ReviewFormState<ReviewResponseField, RevisionsValues> | Response> {
  const id = requireIndicatorId(params);
  requireDecider(context);
  const submissionNumber = requireSubmissionNumber(request, id);
  const values = readRevisions(await request.formData());
  const body = revisionsBody({ submissionNumber, kind: 'pre_imrg_feedback' }, values);
  const checked = reviewResponseSchemaFor(new Date()).safeParse(body);

  if (!checked.success) {
    return { values, fieldErrors: toFieldErrors(checked.error, reviewResponseFieldSchema) };
  }

  const sent = await sendDecision(context, id, {
    submissionNumber,
    decision: 'request_revisions',
    clarificationRequest: body.clarificationRequest,
    flags: body.flags,
  });

  return sent instanceof Response ? sent : { values, ...sent };
}
