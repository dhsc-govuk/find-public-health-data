import { requireApiSession, requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canAssignReviewers, canSeeIndicator } from '@fphd/auth/permissions';
import { Router } from 'express';

import { indicatorAccess, indicatorIdSchema, type ReviewerOptions } from './contract.ts';
import type { InternalIndicatorRepository, InternalReviewerRepository } from './repositories.ts';

/** The reviewers an IMRG manager may assign to an indicator. */
export function internalReviewersRouter(
  reviewers: InternalReviewerRepository,
  indicators: Pick<InternalIndicatorRepository, 'findById'>,
  session: JwtSessionVerifier,
): Router {
  const router = Router();

  router.get(
    '/api/internal/indicators/:id/reviewer-options',
    requireJwtSession(session, canAssignReviewers),
    async (request, response) => {
      const id = indicatorIdSchema.safeParse(request.params.id);

      if (!id.success) {
        response.status(400).json({ error: 'invalid_id' });
        return;
      }

      const row = await indicators.findById(id.data);

      // As on the detail route, an indicator the user may not see answers as if it did not exist.
      if (!row || !canSeeIndicator(requireApiSession(response), indicatorAccess(row))) {
        response.status(404).json({ error: 'not_found' });
        return;
      }

      const body: ReviewerOptions = { reviewers: await reviewers.listOptions(id.data) };

      response.status(200).json(body);
    },
  );

  return router;
}
