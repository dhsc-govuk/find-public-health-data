import { requireApiSession, requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canListIndicators, canSeeIndicatorHistory } from '@fphd/auth/permissions';
import { Router } from 'express';

import { type IndicatorHistory, indicatorAccess, indicatorIdSchema } from './contract.ts';
import { historyEntries } from './indicator-history-entries.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/**
 * GET `/api/internal/indicators/:id/history`: what has happened to the indicator, newest first,
 * for those `canSeeIndicatorHistory` allows. Anyone else gets 404 `not_found`.
 */
export function indicatorHistoryRouter(
  indicators: Pick<InternalIndicatorRepository, 'findHistory'>,
  session: JwtSessionVerifier,
): Router {
  const router = Router();

  router.get(
    '/api/internal/indicators/:id/history',
    requireJwtSession(session, canListIndicators),
    async (request, response) => {
      const id = indicatorIdSchema.safeParse(request.params.id);

      if (!id.success) {
        response.status(400).json({ error: 'invalid_id' });
        return;
      }

      const row = await indicators.findHistory(id.data);

      if (!row || !canSeeIndicatorHistory(requireApiSession(response), indicatorAccess(row))) {
        response.status(404).json({ error: 'not_found' });
        return;
      }

      const body: IndicatorHistory = { entries: historyEntries(row) };
      response.status(200).json(body);
    },
  );

  return router;
}
