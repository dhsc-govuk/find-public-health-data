import { requireApiSession, requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import {
  canAssignReviewers,
  canDecideUpdates,
  canReviewIndicators,
  canSchedulePublication,
  indicatorListScope,
} from '@fphd/auth/permissions';
import { type Request, type Response, Router } from 'express';

import {
  type IndicatorsScheduled,
  type IndicatorsToReview,
  type IndicatorsUnderReview,
  indicatorSearchQuerySchema,
  type UpdatesAwaitingDecision,
} from './contract.ts';
import { toListItem } from './indicators.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/**
 * The dashboard's search from the query string, or null after answering 400 for one that isn't
 * valid. An absent search is undefined, which lists every row.
 */
function searchFrom(request: Request, response: Response): string | undefined | null {
  const query = indicatorSearchQuerySchema.safeParse(request.query);

  if (!query.success) {
    response.status(400).json({ error: 'invalid_search' });
    return null;
  }

  return query.data.search;
}

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
    async (request, response) => {
      const search = searchFrom(request, response);
      if (search === null) return;

      const rows = await indicators.listUnderReview(
        indicatorListScope(requireApiSession(response)),
        search,
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
    async (request, response) => {
      const search = searchFrom(request, response);
      if (search === null) return;

      const rows = await indicators.listToReview(requireApiSession(response).sub, search);
      const body: IndicatorsToReview = { indicators: rows.map(toListItem) };

      response.status(200).json(body);
    },
  );

  router.get(
    '/api/internal/indicators-scheduled',
    requireJwtSession(session, canSchedulePublication),
    async (request, response) => {
      const search = searchFrom(request, response);
      if (search === null) return;

      const rows = await indicators.listScheduled(
        indicatorListScope(requireApiSession(response)),
        search,
      );
      const body: IndicatorsScheduled = { indicators: rows.map(toListItem) };

      response.status(200).json(body);
    },
  );

  router.get(
    '/api/internal/updates-awaiting-decision',
    requireJwtSession(session, canDecideUpdates),
    async (request, response) => {
      const search = searchFrom(request, response);
      if (search === null) return;

      const rows = await indicators.listAwaitingDecision(
        indicatorListScope(requireApiSession(response)),
        search,
      );
      const body: UpdatesAwaitingDecision = { indicators: rows.map(toListItem) };

      response.status(200).json(body);
    },
  );

  return router;
}
