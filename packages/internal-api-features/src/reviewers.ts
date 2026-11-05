import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canAssignReviewers } from '@fphd/auth/permissions';
import { Router } from 'express';

import type { ReviewerOptions } from './contract.ts';
import { guardedIndicator, requireIndicatorAccess } from './indicator-access.ts';
import type { InternalIndicatorRepository, InternalReviewerRepository } from './repositories.ts';

/** The reviewers an IMRG manager may assign to an indicator. */
export function internalReviewersRouter(
  reviewers: InternalReviewerRepository,
  indicators: Pick<InternalIndicatorRepository, 'findAccess'>,
  session: JwtSessionVerifier,
): Router {
  const router = Router();

  router.get(
    '/api/internal/indicators/:id/reviewer-options',
    requireIndicatorAccess(session, indicators, canAssignReviewers),
    async (_request, response) => {
      const { id } = guardedIndicator(response);

      const body: ReviewerOptions = { reviewers: await reviewers.listOptions(id) };

      response.status(200).json(body);
    },
  );

  return router;
}
