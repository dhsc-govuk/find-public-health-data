import { checkDependencies, serverLogging, startServer } from '@fphd/api-server';
import { closeDb, createRepositories, pingDb } from '@fphd/db';
import { createLogger } from '@fphd/logger';

import { createApp } from './app.ts';
import * as config from './config.ts';
import { db } from './db.ts';

const logger = createLogger({
  name: 'public-api',
  level: config.log.level,
  pretty: config.log.pretty,
  requestDetails: config.log.requestDetails,
});

const server = startServer({
  app: createApp({ logger, repositories: createRepositories(db) }),
  host: config.host,
  port: config.port,
  shutdown: config.shutdown,
  ...serverLogging(logger, { port: config.port, onShutdown: () => closeDb(db) }),
});

server.once('listening', () => {
  void checkDependencies(logger, [{ name: 'database', check: () => pingDb(db) }]);
});
