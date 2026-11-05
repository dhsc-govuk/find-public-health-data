import { createJwtSessionService } from '@fphd/auth/jwt-session';
import { createSessionContext, sessionMiddleware } from '@fphd/web-server/session';
import { describe, expect, it } from 'vitest';

import { middleware } from './dashboard.tsx';

const session = createJwtSessionService({
  audience: 'fphd-internal',
  cookieName: 'fphd-internal-session',
  issuer: 'fphd-auth',
  secret: 'a-jwt-session-secret-that-is-long-enough-for-tests',
  secure: false,
});

/** Where the dashboard layout sends a user holding these roles: through, or elsewhere. */
async function outcome(roles: readonly string[]): Promise<string> {
  const token = await session.issueToken({
    expiresInSeconds: 900,
    roles: ['public', ...roles],
    subject: 'test-user',
    teams: [],
  });
  const request = new Request('https://internal.test/dashboard', {
    headers: { Cookie: session.createCookieHeader(token, 900) },
  });
  const args = {
    context: createSessionContext(session),
    params: {},
    pattern: '/dashboard',
    request,
    url: new URL(request.url),
  };
  const [requireLister] = middleware;
  if (requireLister === undefined) throw new Error('The dashboard layout has no middleware');

  try {
    const response = await sessionMiddleware(args, async () => {
      const admitted = await requireLister(args, async () => new Response('Dashboard'));
      if (!(admitted instanceof Response)) throw new Error('The layout returned no response');
      return admitted;
    });
    return response instanceof Response ? await response.text() : 'no response';
  } catch (error) {
    if (error instanceof Response) return error.headers.get('Location') ?? '';
    throw error;
  }
}

describe('the dashboard layout', () => {
  it.each([
    ['a publisher', ['publisher']],
    ['an IMRG manager', ['imrg-manager']],
    ['an IMRG reviewer', ['imrg-reviewer']],
    ['an admin', ['admin']],
  ])('admits %s', async (_who, roles) => {
    expect(await outcome(roles)).toBe('Dashboard');
  });

  it('turns away a user holding none of the four internal roles', async () => {
    expect(await outcome([])).toBe('/access-denied');
  });
});
