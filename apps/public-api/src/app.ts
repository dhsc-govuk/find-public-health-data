import { addFallbackHandlers, createApiApp } from '@fphd/api-server';
import type { Repositories } from '@fphd/db';
import type { Logger } from '@fphd/logger';
import { publicApiRoutes } from '@fphd/public-api-features';

export interface AppDependencies {
  logger: Logger;
  repositories: Repositories;
}

export function createApp({ logger, repositories }: AppDependencies) {
  // Nothing in front may keep a copy: a newly published indicator must show on the next request.
  const app = createApiApp({ logger, serviceName: 'public-api', cacheControl: 'no-store' });

  app.use(publicApiRoutes(repositories));

  addFallbackHandlers(app);
  return app;
}
