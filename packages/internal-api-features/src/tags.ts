import { requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canEditIndicators } from '@fphd/auth/permissions';
import { Router } from 'express';

import type { TagOptions } from './contract.ts';
import type { InternalTagRepository } from './repositories.ts';

/** The topics and classifications a publisher tags an indicator with. */
export function internalTagsRouter(
  tags: InternalTagRepository,
  session: JwtSessionVerifier,
): Router {
  const router = Router();

  router.get(
    '/api/internal/tags',
    requireJwtSession(session, canEditIndicators),
    async (_request, response) => {
      const options: TagOptions = await tags.listOptions();

      response.status(200).json(options);
    },
  );

  return router;
}
