import { createServer, type Server } from 'node:http';

import express, { type Express } from 'express';

import { universalSecurityHeaders } from './security-headers.ts';
import { installShutdownHandlers, type ShutdownOptions } from './shutdown.ts';

export {
  type CheckDependenciesOptions,
  checkDependencies,
  type Dependency,
} from './dependency-check.ts';
export { REQUEST_ID_HEADER, requestId } from './request-id.ts';
export {
  type RequestLoggingOptions,
  requestAwareLogger,
  requestLogging,
} from './request-logging.ts';
export { universalSecurityHeaders } from './security-headers.ts';
export { serverLogging } from './server-logging.ts';

/** Base app for every server: shared configuration and routes go here. */
export function createBaseApp({
  serviceName,
  isLive = () => true,
}: {
  serviceName: string;
  /**
   * Called on each `/livez` request. Returning false makes `/livez` answer 503 with the status
   * 'stalled', which asks the platform to restart the process. The internal worker uses this to
   * report that its sweep loop has hung.
   */
  isLive?: () => boolean;
}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(universalSecurityHeaders());

  // Stays 200 while draining: the process is alive, and failing this asks for a restart.
  app.get('/livez', (_request, response) => {
    const live = isLive();
    response
      .status(live ? 200 : 503)
      .json({ status: live ? 'ok' : 'stalled', service: serviceName });
  });

  // Off `app.locals` so the drain can flip it without a capability threaded through every app
  // factory.
  app.get('/readyz', (request, response) => {
    const draining = request.app.locals.draining === true;
    response
      .status(draining ? 503 : 200)
      .json({ status: draining ? 'draining' : 'ok', service: serviceName });
  });

  return app;
}

export interface StartServerOptions {
  app: Express;
  host: string;
  port: number;
  /** Taken whole, so no app can pass one number and forget the other. */
  shutdown: Pick<ShutdownOptions, 'drainDelayMs' | 'gracePeriodMs'>;
  onListening: () => void;
  /** The server could not bind, after which the process exits 1. */
  onListenError: (error: Error) => void;
  onStopping?: ShutdownOptions['onStopping'];
  onShutdown?: ShutdownOptions['onShutdown'];
  onForcedClose?: ShutdownOptions['onForcedClose'];
  onError?: ShutdownOptions['onError'];
}

/** Every app listens through here, so none can be left without signal handlers. */
export function startServer({
  app,
  host,
  port,
  shutdown,
  onListening,
  onListenError,
  onStopping,
  onShutdown,
  onForcedClose,
  onError,
}: StartServerOptions): Server {
  // `app.listen` would hand a bind error to the listening callback, so both events are ours.
  const server = createServer(app);

  installShutdownHandlers(server, {
    ...shutdown,
    onStopping,
    onDraining: () => {
      app.locals.draining = true;
    },
    onShutdown,
    onForcedClose,
    onError,
  });

  const failToListen = (error: Error) => {
    onListenError(error);
    process.exit(1);
  };
  server.once('error', failToListen);
  server.once('listening', () => {
    server.off('error', failToListen);
    onListening();
  });
  server.listen(port, host);

  return server;
}
