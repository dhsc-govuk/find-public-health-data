import { createJwtSessionService, createJwtSessionVerifier } from '@fphd/auth/jwt-session';
import { createSessionContext, sessionMiddleware } from '@fphd/web-server/session';
import type { RouterContextProvider } from 'react-router';

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
    roles: ['public', ...roles],
    subject: 'test-user',
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
