import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { createRequestHandler } from '@react-router/express';
import express, { type Express, type Request, type RequestHandler, type Response } from 'express';
import { RouterContextProvider, type ServerBuild } from 'react-router';

import { loggerContext } from './logger-context.ts';
import { nonceContext } from './nonce-context.ts';
import { createSessionContext } from './session.ts';

type OptionalServerBuildKey = 'allowedActionOrigins' | 'basename' | 'unstable_getCriticalCss';

type GeneratedServerBuild = Omit<ServerBuild, OptionalServerBuildKey> & {
  allowedActionOrigins: ServerBuild['allowedActionOrigins'] | undefined;
  basename: ServerBuild['basename'] | undefined;
  unstable_getCriticalCss: ServerBuild['unstable_getCriticalCss'] | undefined;
};

export type ReactRouterBuildLoader = () => Promise<GeneratedServerBuild>;

/**
 * React Router's generated module emits optional build fields as required
 * properties whose values can be undefined. Convert that generated shape into
 * the public ServerBuild shape by omitting absent optional fields.
 */
function normalizeServerBuild({
  allowedActionOrigins,
  basename,
  unstable_getCriticalCss,
  ...build
}: GeneratedServerBuild): ServerBuild {
  return {
    ...build,
    ...(allowedActionOrigins === undefined ? {} : { allowedActionOrigins }),
    ...(basename === undefined ? {} : { basename }),
    ...(unstable_getCriticalCss === undefined ? {} : { unstable_getCriticalCss }),
  };
}

interface ReactRouterAppOptions {
  backendMiddleware?: readonly RequestHandler[];
  /** What verifies a signed-in visitor's session; an app nobody signs in to has none. */
  session?: JwtSessionVerifier;
  /** Proxies in front of the app whose X-Forwarded-* headers are trusted; 0 trusts none. */
  trustedProxyHops: number;
  /**
   * Runs after the nonce and logger are set, so it can add further values to the loader/action
   * context. The request lets a value be request-scoped, such as the API client. The signal
   * aborts as the loader's `request.signal` does, when the browser leaves before the response
   * finishes.
   */
  extendContext?: (context: RouterContextProvider, request: Request, signal: AbortSignal) => void;
}

/** The signal `@react-router/express` gives the loader's request, built the same way. */
function abortedOnClose(response: Response): AbortSignal {
  const controller = new AbortController();
  let finished = false;
  response.on('finish', () => {
    finished = true;
  });
  response.on('close', () => {
    if (!finished) controller.abort();
  });
  return controller.signal;
}

export function createReactRouterApp(
  loadBuild: ReactRouterBuildLoader,
  { backendMiddleware = [], session, trustedProxyHops, extendContext }: ReactRouterAppOptions,
): Express {
  const app = express();

  app.disable('x-powered-by');
  // Host, protocol and client address from X-Forwarded-* once a proxy sits in front, or React
  // Router's action origin check compares the browser's Origin against the ingress host.
  app.set('trust proxy', trustedProxyHops);
  app.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'private, no-store');
    next();
  });

  for (const middleware of backendMiddleware) app.use(middleware);

  app.use(
    createRequestHandler({
      build: async () => normalizeServerBuild(await loadBuild()),
      getLoadContext: (request, response) => {
        const context =
          session === undefined ? new RouterContextProvider() : createSessionContext(session);
        context.set(nonceContext, response.locals.nonce);
        context.set(loggerContext, response.locals.logger);
        extendContext?.(context, request, abortedOnClose(response));
        return context;
      },
    }),
  );

  return app;
}
