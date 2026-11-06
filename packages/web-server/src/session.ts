import type { JwtSessionClaims, JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { InvalidJwtSessionError } from '@fphd/auth/session-errors';
import {
  createContext,
  type MiddlewareFunction,
  type RouterContext,
  RouterContextProvider,
  redirect,
} from 'react-router';

import { pagePath } from './page-url.ts';

type SessionContextReader = {
  get<T>(context: RouterContext<T>): T;
};

const sessionServiceContext = createContext<JwtSessionVerifier>();
const requestSessionContext = createContext<JwtSessionClaims | undefined>();

/** Sends a visitor without a session to sign in, and one `allows` refuses to `forbiddenPath`. */
export function createRequireSessionMiddleware({
  allows,
  forbiddenPath,
  signInPath,
}: {
  allows: (session: JwtSessionClaims) => boolean;
  forbiddenPath: string;
  signInPath: string;
}): MiddlewareFunction<Response> {
  return async ({ context, request }, next) => {
    const session = getSession(context);

    if (session === undefined) {
      const requestUrl = new URL(request.url);
      const signInUrl = new URL(signInPath, requestUrl);
      signInUrl.searchParams.set('returnTo', pagePath(requestUrl));
      throw redirect(`${signInUrl.pathname}${signInUrl.search}`);
    }

    if (!allows(session)) throw redirect(forbiddenPath);

    return next();
  };
}

export const sessionMiddleware: MiddlewareFunction<Response> = async (
  { context, request },
  next,
) => {
  const service = context.get(sessionServiceContext);
  const token = service.readToken(request.headers.get('Cookie'));
  let invalidToken = false;
  let session: JwtSessionClaims | undefined;

  if (token !== undefined) {
    try {
      session = await service.verifyToken(token);
    } catch (error) {
      if (!(error instanceof InvalidJwtSessionError)) throw error;
      invalidToken = true;
    }
  }

  context.set(requestSessionContext, session);
  try {
    const response = await next();

    if (invalidToken) response.headers.append('Set-Cookie', service.clearCookieHeader());

    return response;
  } catch (error) {
    if (invalidToken && error instanceof Response) {
      error.headers.append('Set-Cookie', service.clearCookieHeader());
    }
    throw error;
  }
};

export function getSession(context: SessionContextReader): JwtSessionClaims | undefined {
  return context.get(requestSessionContext);
}

export function createSessionContext(service: JwtSessionVerifier): RouterContextProvider {
  const context = new RouterContextProvider();
  context.set(sessionServiceContext, service);
  return context;
}
