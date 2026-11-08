import type { Repositories } from '@fphd/db';
import { Router } from 'express';

import { areasRouter } from './areas.ts';
import { type IndicatorsRouterOptions, indicatorsRouter } from './indicators.ts';
import { topicsRouter } from './topics.ts';
import { v0Routes } from './v0/routes.ts';

export { areasRouter } from './areas.ts';
export {
  type IndicatorDetailBody,
  type IndicatorsRouterOptions,
  indicatorsRouter,
} from './indicators.ts';
export { topicsRouter } from './topics.ts';
export { v0Routes } from './v0/routes.ts';

/**
 * Every route on the public API surface, in one router. `internal-api` mounts this too, so
 * it is a superset of the public API by construction — a new public endpoint cannot be
 * added to one app and forgotten in the other. Only the internal API's preview passes `options`.
 */
export function publicApiRoutes(
  repositories: Repositories,
  options: IndicatorsRouterOptions = {},
): Router {
  const router = Router();

  router.use(areasRouter(repositories.areas));
  router.use(indicatorsRouter(repositories.indicators, options));
  router.use(topicsRouter(repositories.topics));
  router.use(v0Routes(repositories));

  return router;
}
