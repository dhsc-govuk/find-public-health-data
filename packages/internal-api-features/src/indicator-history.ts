import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canSeeIndicatorHistory } from '@fphd/auth/permissions';
import { Router } from 'express';

import type { IndicatorHistory } from './contract.ts';
import { guardedIndicator, requireIndicatorAccess } from './indicator-access.ts';
import { historyEntries } from './indicator-history-entries.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/**
 * GET `/api/internal/indicators/:id/history`: what has happened to the indicator, newest first,
 * for those `canSeeIndicatorHistory` allows.
 */
export function indicatorHistoryRouter(
  indicators: Pick<InternalIndicatorRepository, 'findAccess' | 'findHistory'>,
  session: JwtSessionVerifier,
): Router {
  const router = Router();

  router.get(
    '/api/internal/indicators/:id/history',
    requireIndicatorAccess(session, indicators, canSeeIndicatorHistory),
    async (_request, response) => {
      const { id } = guardedIndicator(response);

      const row = await indicators.findHistory(id);

      if (!row) {
        response.status(404).json({ error: 'not_found' });
        return;
      }

      const body: IndicatorHistory = { entries: historyEntries(row) };
      response.status(200).json(body);
    },
  );

  return router;
}
