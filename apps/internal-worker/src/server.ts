import { closeDb, pingDb } from '@fphd/db';
import { checkDependencies, serverLogging, startServer } from '@fphd/express';
import { publishDueVersions } from '@fphd/internal-workflow';
import { createLogger } from '@fphd/logger';

import { createApp } from './app.ts';
import * as config from './config.ts';
import { db } from './db.ts';
import { startSweeps } from './sweeps.ts';

const logger = createLogger({
  name: 'internal-worker',
  level: config.log.level,
  pretty: config.log.pretty,
});

const sweeps = startSweeps({
  sweep: (shouldStop) => publishDueVersions(db, logger, { shouldStop }),
  logger,
});

const logging = serverLogging(logger, {
  port: config.port,
  revision: config.revision,
  onShutdown: async () => {
    await sweeps.stop();
    await closeDb(db);
  },
});

const server = startServer({
  app: createApp({ lastSweepCompletedAt: sweeps.lastCompletedAt }),
  host: config.host,
  port: config.port,
  shutdown: config.shutdown,
  ...logging,
  // From the first signal, no sweep starts and the one in flight takes no further version.
  onStopping: (signal, budgets) => {
    void sweeps.stop();
    logging.onStopping(signal, budgets);
  },
});

server.once('listening', () => {
  void checkDependencies(logger, [{ name: 'database', check: () => pingDb(db) }]);
});
