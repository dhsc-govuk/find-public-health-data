import { createLogger } from '@fphd/logger';
import { serverLogging, startReactRouterServer } from '@fphd/web-server';

import * as config from './server/config.ts';

const logger = createLogger({
  name: 'public-web',
  level: config.log.level,
  pretty: config.log.pretty,
  requestDetails: config.log.requestDetails,
});

await startReactRouterServer({
  basicAuth: config.basicAuth,
  development: config.development,
  host: config.host,
  logger,
  port: config.port,
  shutdown: config.shutdown,
  rootDirectory: import.meta.dirname,
  serviceName: 'public-web',
  ...serverLogging(logger, { port: config.port, revision: config.revision }),
});
