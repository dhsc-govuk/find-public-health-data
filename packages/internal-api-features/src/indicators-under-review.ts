import { requireApiSession, requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import {
  canAssignReviewers,
  canReviewIndicators,
  indicatorListScope,
} from '@fphd/auth/permissions';
import { Router } from 'express';

import type { IndicatorsToReview, IndicatorsUnderReview } from './contract.ts';
import { toListItem } from './indicators.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/**
 * The review queues, unpaginated: every open submission an IMRG manager may see, and the
 * submissions in review that a reviewer is assigned.
 */
export function internalIndicatorsUnderReviewRouter(
  indicators: Pick<InternalIndicatorRepository, 'listUnderReview' | 'listToReview'>,
  session: JwtSessionVerifier,
): Router {
  const router = Router();

  router.get(
    '/api/internal/indicators-under-review',
    requireJwtSession(session, canAssignReviewers),
    async (_request, response) => {
      const rows = await indicators.listUnderReview(
        indicatorListScope(requireApiSession(response)),
      );
      const body: IndicatorsUnderReview = {
        unassigned: rows.unassigned.map(toListItem),
        assigned: rows.assigned.map(toListItem),
      };

      response.status(200).json(body);
    },
  );

  router.get(
    '/api/internal/indicators-to-review',
    requireJwtSession(session, canReviewIndicators),
    async (_request, response) => {
      const rows = await indicators.listToReview(requireApiSession(response).sub);
      const body: IndicatorsToReview = { indicators: rows.map(toListItem) };

      response.status(200).json(body);
    },
  );

  return router;
}
