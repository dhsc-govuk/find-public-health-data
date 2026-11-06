import { requireApiActor, requireApiSession, requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canAssignReviewers, canReviewIndicators, canSeeIndicator } from '@fphd/auth/permissions';
import type { IndicatorStepResult } from '@fphd/internal-workflow';
import { type Request, type Response, Router } from 'express';

import {
  type IndicatorAssignReviewersError,
  type IndicatorStep,
  type IndicatorSubmitError,
  type IndicatorWithdrawError,
  indicatorAccess,
  indicatorAssignReviewersSchema,
  indicatorIdSchema,
  indicatorSubmitSchema,
  indicatorWithdrawSchema,
  type ReviewResponseError,
  reviewedBeforeSubmissionMessage,
  reviewResponseBodySchema,
  reviewResponseFieldSchema,
  reviewResponseSchemaFor,
  toFieldErrors,
} from './contract.ts';
import { requireIndicatorEditor } from './indicator-editor.ts';
import type { IndicatorAdminDetailRow } from './indicator-list-repository.ts';
import { mayTakeStep } from './indicator-workflow.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/**
 * The indicator `:id` names, once the user may take `step` on it, or undefined once the answer is
 * sent: 400 for an id that is not one, 404 for no such indicator or one the user may not see, 403
 * for a user who may see it but not take the step.
 */
export async function stepIndicator(
  indicators: Pick<InternalIndicatorRepository, 'findById'>,
  step: IndicatorStep,
  request: Request,
  response: Response,
): Promise<IndicatorAdminDetailRow | undefined> {
  const id = indicatorIdSchema.safeParse(request.params.id);

  if (!id.success) {
    response.status(400).json({ error: 'invalid_id' });
    return undefined;
  }

  const row = await indicators.findById(id.data);
  const session = requireApiSession(response);

  if (row === undefined || !canSeeIndicator(session, indicatorAccess(row))) {
    response.status(404).json({ error: 'not_found' });
    return undefined;
  }

  if (!mayTakeStep(session, indicatorAccess(row), step)) {
    response.status(403).json({ error: 'forbidden' });
    return undefined;
  }

  return row;
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
  const requireEditor = requireIndicatorEditor(session, indicators);

  router.post('/api/internal/indicators/:id/submit', requireEditor, async (request, response) => {
    const id = (await stepIndicator(indicators, 'submit', request, response))?.id;

    if (id === undefined) return;

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

    request.log.info({ indicatorId: id }, 'Indicator submitted');
    response.status(204).end();
  });

  router.post('/api/internal/indicators/:id/withdraw', requireEditor, async (request, response) => {
    const id = (await stepIndicator(indicators, 'withdraw', request, response))?.id;

    if (id === undefined) return;

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

    request.log.info({ indicatorId: id }, 'Indicator submission withdrawn');
    response.status(204).end();
  });

  router.post(
    '/api/internal/indicators/:id/assign-reviewers',
    requireJwtSession(session, canAssignReviewers),
    async (request, response) => {
      const id = (await stepIndicator(indicators, 'assign_reviewers', request, response))?.id;

      if (id === undefined) return;

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
    requireJwtSession(session, canReviewIndicators),
    async (request, response) => {
      // Every response step takes the same permission, so any one of them checks it.
      const row = await stepIndicator(indicators, 'give_feedback', request, response);

      if (row === undefined) return;

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

      const result = await indicators.respond(
        row.id,
        sent.data,
        requireApiActor(request, response),
      );

      if (!result.ok && result.reason === 'reviewed_before_submission') {
        if (row.draftFirstSubmittedAt === null) {
          throw new Error(`indicator ${row.id} refused a date before a submission it never had`);
        }
        response.status(400).json({
          error: 'validation_failed',
          fieldErrors: {
            imrgReviewedOn: reviewedBeforeSubmissionMessage(row.draftFirstSubmittedAt),
          },
        } satisfies ReviewResponseError);
        return;
      }

      if (!result.ok) {
        refuse(response, result);
        return;
      }

      request.log.info({ indicatorId: row.id, kind: sent.data.kind }, 'Review response recorded');
      response.status(204).end();
    },
  );

  return router;
}
