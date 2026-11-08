import type { Repositories } from '@fphd/db';
import { Router } from 'express';

import { dimensionsRouter } from './dimensions.ts';
import { cors, handleError, notFound } from './http.ts';
import { openApiRouter } from './openapi.ts';
import { tagsRouter } from './tags.ts';

/**
 * Version 0 of the public API. Its errors are problem details, unlike the interim `/api`
 * routes, so it has its own not-found and error handlers, scoped to `/v0`.
 */
export function v0Routes(repositories: Repositories): Router {
  const router = Router();

  router.use('/v0', cors);
  router.use(openApiRouter());
  router.use(tagsRouter(repositories.reference));
  router.use(dimensionsRouter(repositories.reference));
  router.use('/v0', notFound);
  router.use('/v0', handleError);

  return router;
}
