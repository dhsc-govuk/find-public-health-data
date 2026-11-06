import { createJwtSessionService } from '@fphd/auth/jwt-session';
import { createSessionContext, sessionMiddleware } from '@fphd/web-server/session';
import { describe, expect, it } from 'vitest';

import { loader } from './home.tsx';

const session = createJwtSessionService({
  audience: 'fphd-internal',
  cookieName: 'fphd-internal-session',
  issuer: 'fphd-auth',
  secret: 'a-jwt-session-secret-that-is-long-enough-for-tests',
  secure: false,
});

// The loader reads the session the middleware put in context, so it runs inside it.
async function runLoader(path: string, roles?: readonly string[]) {
  const headers = new Headers();

  if (roles !== undefined) {
    const token = await session.issueToken({
      expiresInSeconds: 900,
      roles,
      subject: 'test-user',
      teams: [],
    });
    headers.set('Cookie', session.createCookieHeader(token, 900));
  }

  const request = new Request(`https://internal.test${path}`, { headers });
  const args = {
    context: createSessionContext(session),
    params: {},
    pattern: '/',
    request,
    url: new URL(request.url),
  };
  let result: ReturnType<typeof loader> | undefined;

  const response = await sessionMiddleware(args, async () => {
    result = loader(args);
    return new Response();
  });

  if (!(response instanceof Response) || result === undefined) {
    throw new Error('The loader did not run');
  }
  return result;
}

describe('the internal home', () => {
  it('sends a signed-in user to the dashboard', async () => {
    const result = await runLoader('/', ['public', 'publisher']);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get('Location')).toBe('/dashboard');
  });

  it('offers a signed-out visitor the sign-in', async () => {
    expect(await runLoader('/')).toEqual({ signInHref: '/sign-in' });
  });

  it('carries the page a signed-out visitor wanted through to the sign-in', async () => {
    expect(await runLoader('/?returnTo=%2Fdashboard%3Fpage%3D2')).toEqual({
      signInHref: '/sign-in?returnTo=%2Fdashboard%3Fpage%3D2',
    });
  });

  it('drops a return address on another site', async () => {
    expect(await runLoader('/?returnTo=https%3A%2F%2Fexample.com%2F')).toEqual({
      signInHref: '/sign-in',
    });
  });
});
