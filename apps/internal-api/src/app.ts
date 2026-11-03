import { addFallbackHandlers, createApiApp, requireJwtRole } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import type { Repositories } from '@fphd/db';
import {
  INTERNAL_API_BODY_LIMITS,
  type InternalRepositories,
  internalApiRoutes,
} from '@fphd/internal-api-features';
import type { BlobStorage } from '@fphd/internal-storage';
import type { Logger } from '@fphd/logger';
import { publicApiRoutes } from '@fphd/public-api-features';

export interface AppDependencies {
  logger: Logger;
  repositories: Repositories;
  internalRepositories: InternalRepositories;
  session: JwtSessionVerifier;
  storage: BlobStorage;
}

export function createApp({
  logger,
  repositories,
  internalRepositories,
  session,
  storage,
}: AppDependencies) {
  const app = createApiApp({
    logger,
    serviceName: 'internal-api',
    bodyLimits: INTERNAL_API_BODY_LIMITS,
  });

  app.use(publicApiRoutes(repositories));

  app.get('/api/internal', requireJwtRole(session, 'internal'), (_request, response) => {
    response.status(200).json({
      service: 'find-public-health-data',
      audience: 'internal',
    });
  });

  app.use(internalApiRoutes({ repositories: internalRepositories, session, storage }));

  addFallbackHandlers(app);
  return app;
}
