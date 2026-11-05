import { requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canEditIndicators } from '@fphd/auth/permissions';
import { Router } from 'express';

import type { DataProvider } from './contract.ts';
import type { InternalDataProviderRepository } from './repositories.ts';

/** The providers a publisher chooses a numerator's or denominator's sources from. */
export function internalDataProvidersRouter(
  dataProviders: InternalDataProviderRepository,
  session: JwtSessionVerifier,
): Router {
  const router = Router();

  router.get(
    '/api/internal/data-providers',
    requireJwtSession(session, canEditIndicators),
    async (_request, response) => {
      const providers: DataProvider[] = await dataProviders.list();

      response.status(200).json(providers);
    },
  );

  return router;
}
