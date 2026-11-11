import { createJwtSessionService, createJwtSessionVerifier } from '@fphd/auth/jwt-session';
import { createSessionContext, sessionMiddleware } from '@fphd/web-server/session';
import type { RouterContextProvider } from 'react-router';

/**
 * The signed-in user's id. A user id is a UUID, so an API answer naming this user, such as a
 * draft's reviewer, passes the contract.
 */
export const SIGNED_IN_USER_ID = '00000000-0000-7000-8000-0000000000aa';

const service = createJwtSessionService({
  audience: 'fphd-internal',
  cookieName: 'fphd-internal-session',
  issuer: 'fphd-auth',
  secret: 'a-jwt-session-secret-that-is-long-enough-for-tests',
  secure: false,
});

/** A loader's context as the session middleware leaves it for a user holding these. */
export async function signedInContext(
  roles: readonly string[],
  teams: readonly string[] = [],
): Promise<RouterContextProvider> {
  const token = await service.issueToken({
    expiresInSeconds: 900,
    roles,
    subject: SIGNED_IN_USER_ID,
    teams,
  });
  const request = new Request('https://internal.test/', {
    headers: { Cookie: service.createCookieHeader(token, 900) },
  });
  const context = createSessionContext(createJwtSessionVerifier(service));

  const response = await sessionMiddleware(
    { context, params: {}, pattern: '/', request, url: new URL(request.url) },
    async () => new Response(),
  );

  if (!(response instanceof Response)) throw new Error('The session middleware did not run');
  return context;
}
