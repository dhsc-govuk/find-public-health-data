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
  // When the first shutdown signal arrives, no new sweep starts, and a sweep that is running
  // publishes no more versions after the one it is on. onShutdown waits for that sweep to end.
  onStopping: (signal, budgets) => {
    void sweeps.stop();
    logging.onStopping(signal, budgets);
  },
});

server.once('listening', () => {
  void checkDependencies(logger, [{ name: 'database', check: () => pingDb(db) }]);
});
