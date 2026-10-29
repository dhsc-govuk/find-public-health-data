import { checkDependencies, serverLogging, startServer } from '@fphd/api-server';
import { sessionCookieName } from '@fphd/auth';
import { createJwtSessionService, createJwtSessionVerifier } from '@fphd/auth/jwt-session';
import { closeDatabase, createRepositories, pingDatabase } from '@fphd/db';
import { createInternalRepositories } from '@fphd/internal-api-features';
import { createAzureBlobStorage } from '@fphd/internal-storage';
import { createLogger } from '@fphd/logger';

import { createApp } from './app.ts';
import * as config from './config.ts';
import { db } from './db.ts';

const logger = createLogger({
  name: 'internal-api',
  level: config.log.level,
  pretty: config.log.pretty,
  requestDetails: config.log.requestDetails,
});

const storage = await createAzureBlobStorage(config.storage);

startServer({
  app: createApp({
    logger,
    repositories: createRepositories(db),
    internalRepositories: createInternalRepositories(db),
    session: createJwtSessionVerifier(
      createJwtSessionService({
        audience: 'fphd-internal',
        // internal-web forwards this cookie under the same name; the helper keeps the two in step.
        cookieName: sessionCookieName('internal'),
        issuer: 'fphd-auth',
        ...config.session,
      }),
    ),
    storage,
  }),
  host: config.host,
  port: config.port,
  shutdown: config.shutdown,
  ...serverLogging(logger, { port: config.port, onShutdown: () => closeDatabase(db) }),
});

await checkDependencies(logger, [
  { name: 'database', check: () => pingDatabase(db) },
  { name: 'blob storage', check: () => storage.ping() },
]);
