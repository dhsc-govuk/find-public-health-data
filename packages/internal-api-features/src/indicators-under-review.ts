import { requireApiSession, requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import {
  canAssignReviewers,
  canDecideUpdates,
  canReviewIndicators,
  canSchedulePublication,
  indicatorListScope,
} from '@fphd/auth/permissions';
import { Router } from 'express';

import type {
  IndicatorsScheduled,
  IndicatorsToReview,
  IndicatorsUnderReview,
  UpdatesAwaitingDecision,
} from './contract.ts';
import { toListItem } from './indicators.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/**
 * The workflow's queues, unpaginated: every open submission an IMRG manager may see, the
 * submissions in review assigned to a reviewer, the approved indicators an admin schedules, and
 * the submitted updates the core team decides on.
 */
export function internalIndicatorsUnderReviewRouter(
  indicators: Pick<
    InternalIndicatorRepository,
    'listUnderReview' | 'listToReview' | 'listScheduled' | 'listAwaitingDecision'
  >,
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

  router.get(
    '/api/internal/indicators-scheduled',
    requireJwtSession(session, canSchedulePublication),
    async (_request, response) => {
      const rows = await indicators.listScheduled(indicatorListScope(requireApiSession(response)));
      const body: IndicatorsScheduled = { indicators: rows.map(toListItem) };

      response.status(200).json(body);
    },
  );

  router.get(
    '/api/internal/updates-awaiting-decision',
    requireJwtSession(session, canDecideUpdates),
    async (_request, response) => {
      const rows = await indicators.listAwaitingDecision(
        indicatorListScope(requireApiSession(response)),
      );
      const body: UpdatesAwaitingDecision = { indicators: rows.map(toListItem) };

      response.status(200).json(body);
    },
  );

  return router;
}
