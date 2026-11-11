import { requireApiActor } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import type { IndicatorStepResult } from '@fphd/internal-workflow';
import { type RequestHandler, type Response, Router } from 'express';

import {
  type IndicatorAssignReviewersError,
  type IndicatorStep,
  type IndicatorSubmitError,
  type IndicatorWithdrawError,
  indicatorAssignReviewersSchema,
  indicatorSubmitSchema,
  indicatorWithdrawSchema,
  type ReviewResponseError,
  reviewedBeforeSubmissionMessage,
  reviewResponseBodySchema,
  reviewResponseFieldSchema,
  reviewResponseSchemaFor,
  toFieldErrors,
} from './contract.ts';
import {
  guardedIndicator,
  type IndicatorAccessReader,
  requireIndicatorAccess,
} from './indicator-access.ts';
import { mayTakeStep } from './indicator-workflow.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/** The guard on a workflow step's route: `requireIndicatorAccess` with the step's permission. */
export function requireStep(
  session: JwtSessionVerifier,
  indicators: IndicatorAccessReader,
  step: IndicatorStep,
): RequestHandler {
  return requireIndicatorAccess(session, indicators, (user, indicator) =>
    mayTakeStep(user, indicator, step),
  );
}

/** Where a reviewer posts their response, which may carry many long flags. */
export const REVIEW_RESPONSE_PATH = '/api/internal/indicators/:id/review-response';

/** A refused step: no draft is a 404, and every other reason a 409 naming it. */
export function refuse<Reason extends string>(
  response: Response,
  { reason }: Extract<IndicatorStepResult<Reason>, { ok: false }>,
): void {
  response.status(reason === 'no_draft' ? 404 : 409).json({ error: reason });
}

/** Why an assignment's reviewers are refused before the repository is asked, if they are. */
function reviewerListProblem(
  reviewerIds: readonly string[],
): IndicatorAssignReviewersError | undefined {
  if (reviewerIds.length === 0) return { error: 'no_reviewers' };
  if (new Set(reviewerIds).size !== reviewerIds.length) return { error: 'duplicate_reviewers' };
  return undefined;
}

/**
 * The steps through review: a publisher submitting a draft for approval and withdrawing it, an
 * IMRG manager assigning its reviewers, and a reviewer responding. `now` is the clock that an
 * IMRG review date may not pass.
 */
export function indicatorSubmissionsRouter(
  indicators: InternalIndicatorRepository,
  session: JwtSessionVerifier,
  now: () => Date = () => new Date(),
): Router {
  const router = Router();

  router.post(
    '/api/internal/indicators/:id/submit',
    requireStep(session, indicators, 'submit'),
    async (request, response) => {
      const { id } = guardedIndicator(response);

      const body = indicatorSubmitSchema.safeParse(request.body);

      if (!body.success) {
        response
          .status(400)
          .json({ error: 'invalid_draft_updated_at' } satisfies IndicatorSubmitError);
        return;
      }

      const result = await indicators.submit(
        id,
        new Date(body.data.draftUpdatedAt),
        requireApiActor(request, response),
      );

      if (!result.ok) {
        refuse(response, result);
        return;
      }

      // A repeated request found the draft already submitted for it, so it did nothing to log.
      if (!result.repeated) request.log.info({ indicatorId: id }, 'Indicator submitted');
      response.status(204).end();
    },
  );

  router.post(
    '/api/internal/indicators/:id/withdraw',
    requireStep(session, indicators, 'withdraw'),
    async (request, response) => {
      const { id } = guardedIndicator(response);

      const body = indicatorWithdrawSchema.safeParse(request.body);

      if (!body.success) {
        response
          .status(400)
          .json({ error: 'invalid_submission_number' } satisfies IndicatorWithdrawError);
        return;
      }

      const result = await indicators.withdraw(
        id,
        body.data.submissionNumber,
        requireApiActor(request, response),
      );

      if (!result.ok) {
        refuse(response, result);
        return;
      }

      // As with a submission, a repeated withdrawal did nothing to log.
      if (!result.repeated) request.log.info({ indicatorId: id }, 'Indicator submission withdrawn');
      response.status(204).end();
    },
  );

  router.post(
    '/api/internal/indicators/:id/assign-reviewers',
    requireStep(session, indicators, 'assign_reviewers'),
    async (request, response) => {
      const { id } = guardedIndicator(response);

      const body = indicatorAssignReviewersSchema.safeParse(request.body);

      if (!body.success) {
        response
          .status(400)
          .json({ error: 'invalid_request' } satisfies IndicatorAssignReviewersError);
        return;
      }

      const problem = reviewerListProblem(body.data.reviewerIds);

      if (problem !== undefined) {
        response.status(400).json(problem);
        return;
      }

      const result = await indicators.assignReviewers(
        id,
        body.data,
        requireApiActor(request, response),
      );

      if (!result.ok) {
        refuse(response, result);
        return;
      }

      request.log.info({ indicatorId: id }, 'Reviewers assigned');
      response.status(204).end();
    },
  );

  router.post(
    REVIEW_RESPONSE_PATH,
    // Every response step takes the same permission, so any one of them checks it.
    requireStep(session, indicators, 'give_feedback'),
    async (request, response) => {
      const { id } = guardedIndicator(response);

      if (!reviewResponseBodySchema.safeParse(request.body).success) {
        response.status(400).json({ error: 'invalid_request' } satisfies ReviewResponseError);
        return;
      }

      const sent = reviewResponseSchemaFor(now()).safeParse(request.body);

      if (!sent.success) {
        response.status(400).json({
          error: 'validation_failed',
          fieldErrors: toFieldErrors(sent.error, reviewResponseFieldSchema),
        } satisfies ReviewResponseError);
        return;
      }

      const result = await indicators.respond(id, sent.data, requireApiActor(request, response));

      if (!result.ok && result.reason === 'reviewed_before_submission') {
        const firstSubmittedAt = (await indicators.findById(id))?.draftFirstSubmittedAt;

        if (firstSubmittedAt == null) {
          throw new Error(`indicator ${id} refused a date before a submission it never had`);
        }
        response.status(400).json({
          error: 'validation_failed',
          fieldErrors: {
            imrgReviewedOn: reviewedBeforeSubmissionMessage(firstSubmittedAt),
          },
        } satisfies ReviewResponseError);
        return;
      }

      if (!result.ok) {
        refuse(response, result);
        return;
      }

      request.log.info({ indicatorId: id, kind: sent.data.kind }, 'Review response recorded');
      response.status(204).end();
    },
  );

  return router;
}
