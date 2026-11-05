import { requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canEditIndicators } from '@fphd/auth/permissions';
import { Router } from 'express';

import type { CiMethod } from './contract.ts';
import type { InternalCiMethodRepository } from './repositories.ts';

/** The confidence interval methods a publisher chooses from, with what each asks next. */
export function internalCiMethodsRouter(
  ciMethods: InternalCiMethodRepository,
  session: JwtSessionVerifier,
): Router {
  const router = Router();

  router.get(
    '/api/internal/ci-methods',
    requireJwtSession(session, canEditIndicators),
    async (_request, response) => {
      const methods: CiMethod[] = (await ciMethods.list()).map(
        ({ id, name, description, kind }) => ({ id, name, description, kind }),
      );

      response.status(200).json(methods);
    },
  );

  return router;
}
