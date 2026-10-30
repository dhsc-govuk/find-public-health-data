import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { InvalidJwtSessionError } from '@fphd/auth/session-errors';
import {
  createBaseApp,
  requestId,
  requestLogging,
  type StartServerOptions,
  serverLogging,
  startServer,
} from '@fphd/express';
import type { Logger } from '@fphd/logger';
import type { ErrorRequestHandler, Express, Request, RequestHandler, Response } from 'express';
import { json } from 'express';

export {
  type CheckDependenciesOptions,
  checkDependencies,
  type Dependency,
} from './dependency-check.ts';

export function createApiApp({
  logger,
  serviceName,
}: {
  logger: Logger;
  serviceName: string;
}): Express {
  const app = createBaseApp({ serviceName });

  // Ahead of every route, so a miss is logged as well as a hit. The probes sit on the base app
  // above and never reach it. The id a web app forwarded is kept, so both logs share it.
  app.use(requestLogging(logger, { servesWebApps: true }));
  app.use(json());

  app.get('/api', (_request, response) => {
    response.status(200).json({
      service: 'find-public-health-data',
      audience: 'public',
    });
  });

  return app;
}

// body-parser's error types for a body it refused before any route saw it.
const bodyErrors = new Map([
  ['entity.parse.failed', { status: 400, error: 'invalid_json' }],
  ['entity.too.large', { status: 413, error: 'payload_too_large' }],
]);

// body-parser sets the status with the type, so an error carrying only the type is not one of its own.
function bodyErrorOf(error: unknown): { status: number; error: string } | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if (!('type' in error) || typeof error.type !== 'string') return undefined;

  const bodyError = bodyErrors.get(error.type);

  return 'status' in error && error.status === bodyError?.status ? bodyError : undefined;
}

const handleError: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const bodyError = bodyErrorOf(error);

  if (bodyError !== undefined) {
    response.status(bodyError.status).json({ error: bodyError.error });
    return;
  }

  // pino-http attaches `res.err` to the request line, so the failure joins on `req.id`.
  response.err = error instanceof Error ? error : new Error(String(error));
  response.status(500).json({ error: 'internal_error' });
};

/** Last in the chain: a miss is a JSON 404, and a thrown error a JSON 500 the request line logs. */
export function addFallbackHandlers(app: Express) {
  app.use((_request, response) => {
    response.status(404).json({ error: 'not_found' });
  });

  app.use(handleError);
}

/** Who a request is acting as, for a handler that writes rows carrying the actor. */
export interface ApiSession {
  roles: readonly string[];
  sub: string;
  teams: readonly string[];
}

// Express types every local as `any`, so both ends of the one key we set go through this view.
function sessionLocals(response: Response): { apiSession?: ApiSession } {
  return response.locals;
}

/** The session a guard verified; only a handler mounted behind one can ask for it. */
export function requireApiSession(response: Response): ApiSession {
  const session = sessionLocals(response).apiSession;

  if (session === undefined) {
    throw new Error('requireApiSession called outside a guarded route');
  }

  return session;
}

/** Who makes a change, and the request it came in, as the audit log records them. */
export interface ApiActor {
  userId: string;
  requestId: string | null;
}

/** The signed-in user and the request id, for a handler whose write records its actor. */
export function requireApiActor(request: Request, response: Response): ApiActor {
  return { userId: requireApiSession(response).sub, requestId: requestId(request) ?? null };
}

export function requireJwtRole(verifier: JwtSessionVerifier, role: string): RequestHandler {
  return requireJwtSession(verifier, (session) => session.roles.includes(role));
}

/** Admits a verified session that `allows` admits, such as a check from `@fphd/auth/permissions`. */
export function requireJwtSession(
  verifier: JwtSessionVerifier,
  allows: (session: ApiSession) => boolean,
): RequestHandler {
  return async (request, response, next) => {
    const token = verifier.readToken(request.headers.cookie ?? null);

    if (token === undefined) {
      response.status(401).json({ error: 'authentication_required' });
      return;
    }

    try {
      const { roles, sub, teams } = await verifier.verifyToken(token);
      const session = { roles, sub, teams };

      if (!allows(session)) {
        response.status(403).json({ error: 'forbidden' });
        return;
      }

      sessionLocals(response).apiSession = session;

      next();
    } catch (error) {
      if (!(error instanceof InvalidJwtSessionError)) throw error;
      response.setHeader('Set-Cookie', verifier.clearCookieHeader());
      response.status(401).json({ error: 'invalid_session' });
    }
  };
}

// Re-exported so an API app has one import source, but not wrapped: nothing about starting a
// server is API-specific, and a `startApiServer` that only forwarded would imply otherwise.
export { type StartServerOptions, serverLogging, startServer };
