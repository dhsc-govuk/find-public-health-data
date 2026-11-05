import { requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canEditIndicators } from '@fphd/auth/permissions';
import { Router } from 'express';

import type { InternalValueTypeAndUnitRepository } from './repositories.ts';

/** The value types and units a publisher chooses from. */
export function internalValueTypesAndUnitsRouter(
  valueTypesAndUnits: InternalValueTypeAndUnitRepository,
  session: JwtSessionVerifier,
): Router {
  const router = Router();

  router.get(
    '/api/internal/value-types-and-units',
    requireJwtSession(session, canEditIndicators),
    async (_request, response) => {
      response.status(200).json(await valueTypesAndUnits.listOptions());
    },
  );

  return router;
}
