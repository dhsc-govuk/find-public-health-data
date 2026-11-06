import {
  createJwtSessionService,
  createJwtSessionVerifier,
  type JwtSessionService,
} from '@fphd/auth/jwt-session';
import type { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
  createRequireSessionMiddleware,
  createSessionContext,
  getSession,
  sessionMiddleware,
} from './session.ts';

const sessionSecret = 'a-jwt-session-secret-that-is-long-enough-for-tests';
const currentTime = new Date('2026-07-23T10:00:00.000Z');

function createTestService(
  options: { audience?: string; clock?: () => Date; secure?: boolean } = {},
): JwtSessionService {
  return createJwtSessionService({
    audience: options.audience ?? 'fphd-test-web',
    clock: options.clock ?? (() => currentTime),
    cookieName: 'fphd-test-session',
    issuer: 'fphd-auth',
    secret: sessionSecret,
    secure: options.secure ?? false,
  });
}

interface RunSessionMiddlewareOptions {
  cookie?: string;
  handle: (context: RouterContextProvider) => void | Promise<void>;
  response?: Response;
  service: JwtSessionService;
}

async function runSessionMiddleware({
  cookie,
  handle,
  response = new Response('OK'),
  service,
}: RunSessionMiddlewareOptions): Promise<Response> {
  const context = createSessionContext(service);
  const request = new Request('https://example.test/', {
    ...(cookie === undefined ? {} : { headers: { Cookie: cookie } }),
  });
  const url = new URL(request.url);

  const result = await sessionMiddleware(
    { context, params: {}, pattern: '/', request, url },
    async () => {
      await handle(context);
      return response;
    },
  );

  if (!(result instanceof Response)) {
    throw new Error('Session middleware did not return a response');
  }

  return result;
}

async function issueCookie(
  service: JwtSessionService,
  options: { expiresInSeconds?: number; roles?: readonly string[]; subject?: string } = {},
): Promise<string> {
  const expiresInSeconds = options.expiresInSeconds ?? 900;
  const token = await service.issueToken({
    expiresInSeconds,
    roles: options.roles ?? ['viewer'],
    subject: options.subject ?? 'user-123',
    teams: [],
  });
  const [cookie] = service.createCookieHeader(token, expiresInSeconds).split(';', 1);

  if (cookie === undefined) throw new Error('JWT cookie was not created');
  return cookie;
}

describe('JWT session service', () => {
  it.each([undefined, '', '   '])('requires a JWT signing secret', (secret) => {
    expect(() =>
      createJwtSessionService({
        audience: 'test',
        cookieName: 'test',
        issuer: 'test',
        secret,
        secure: false,
      }),
    ).toThrow('SESSION_JWT_SECRET is required');
  });

  it('requires a sufficiently long JWT signing secret', () => {
    expect(() =>
      createJwtSessionService({
        audience: 'test',
        cookieName: 'test',
        issuer: 'test',
        secret: 'too-short',
        secure: false,
      }),
    ).toThrow('SESSION_JWT_SECRET must be at least 32 bytes');
  });

  it('issues and validates an expiring HS256 JWT with identity, roles and teams', async () => {
    const service = createTestService();
    const token = await service.issueToken({
      expiresInSeconds: 900,
      roles: ['publisher', 'viewer'],
      subject: 'user-123',
      teams: ['team-1'],
    });
    const claims = await service.verifyToken(token);

    expect(token.split('.')).toHaveLength(3);
    expect(claims).toMatchObject({
      aud: 'fphd-test-web',
      exp: Math.floor(currentTime.getTime() / 1_000) + 900,
      iat: Math.floor(currentTime.getTime() / 1_000),
      iss: 'fphd-auth',
      roles: ['publisher', 'viewer'],
      sub: 'user-123',
      teams: ['team-1'],
    });
    expect(claims.jti).not.toBe('');
    expect(Object.isFrozen(claims)).toBe(true);
    expect(Object.isFrozen(claims.roles)).toBe(true);
    expect(Object.isFrozen(claims.teams)).toBe(true);
  });

  it('gives web applications validation operations only', () => {
    const verifier = createJwtSessionVerifier(createTestService());

    expect(Object.keys(verifier).sort()).toEqual(['clearCookieHeader', 'readToken', 'verifyToken']);
  });

  it('creates a secure HTTP-only same-site cookie in production', async () => {
    const service = createTestService({ secure: true });
    const token = await service.issueToken({
      expiresInSeconds: 900,
      roles: ['viewer'],
      subject: 'user-123',
      teams: [],
    });
    const cookie = service.createCookieHeader(token, 900);

    expect(cookie).toContain(`fphd-test-session=${token}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=900');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
  });

  it('rejects expired JWTs', async () => {
    const issuer = createTestService({
      clock: () => new Date(currentTime.getTime() - 60_000),
    });
    const verifier = createTestService();
    const token = await issuer.issueToken({
      expiresInSeconds: 30,
      roles: ['viewer'],
      subject: 'user-123',
      teams: [],
    });

    await expect(verifier.verifyToken(token)).rejects.toThrow('Invalid JWT session');
  });

  it('rejects JWTs issued for a different web application', async () => {
    const otherApplication = createTestService({ audience: 'another-web-app' });
    const verifier = createTestService();
    const token = await otherApplication.issueToken({
      expiresInSeconds: 900,
      roles: ['viewer'],
      subject: 'user-123',
      teams: [],
    });

    await expect(verifier.verifyToken(token)).rejects.toThrow('Invalid JWT session');
  });
});

describe('session check middleware', () => {
  async function runProtectedRequest(
    cookie?: string,
    requestUrl = 'https://example.test/manage?view=drafts',
  ): Promise<Response> {
    const service = createTestService();
    const context = createSessionContext(service);
    const request = new Request(requestUrl, {
      ...(cookie === undefined ? {} : { headers: { Cookie: cookie } }),
    });
    const url = new URL(request.url);
    const args = { context, params: {}, pattern: '/manage', request, url };
    const requirePublisher = createRequireSessionMiddleware({
      allows: (session) => session.roles.includes('publisher'),
      forbiddenPath: '/access-denied',
      signInPath: '/sign-in',
    });

    const result = await sessionMiddleware(args, async () => {
      const protectedResult = await requirePublisher(
        args,
        async () => new Response('Publisher content'),
      );

      if (!(protectedResult instanceof Response)) {
        throw new Error('The check returned no response');
      }

      return protectedResult;
    });

    if (!(result instanceof Response)) throw new Error('Middleware did not return a response');
    return result;
  }

  async function getRedirect(cookie?: string, requestUrl?: string): Promise<Response> {
    try {
      await runProtectedRequest(cookie, requestUrl);
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }

    throw new Error('Protected request did not redirect');
  }

  it('redirects anonymous users to sign in with the requested internal URL', async () => {
    const response = await getRedirect();

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/sign-in?returnTo=%2Fmanage%3Fview%3Ddrafts');
  });

  it.each([
    [
      'https://example.test/manage.data?view=drafts&_routes=routes%2Fmanage',
      '%2Fmanage%3Fview%3Ddrafts',
    ],
    ['https://example.test/_.data', '%2F'],
  ])(
    'sends a client-side navigation back to its page, not its data request: %s',
    async (url, returnTo) => {
      const response = await getRedirect(undefined, url);

      expect(response.headers.get('Location')).toBe(`/sign-in?returnTo=${returnTo}`);
    },
  );

  it('clears an invalid session when redirecting to sign in', async () => {
    const response = await getRedirect('fphd-test-session=not-a-jwt');

    expect(response.headers.get('Location')).toBe('/sign-in?returnTo=%2Fmanage%3Fview%3Ddrafts');
    expect(response.headers.get('Set-Cookie')).toContain('fphd-test-session=');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('turns away a session its check refuses', async () => {
    const service = createTestService();
    const response = await getRedirect(await issueCookie(service, { roles: [] }));

    expect(response.headers.get('Location')).toBe('/access-denied');
  });

  it('admits a session its check admits', async () => {
    const service = createTestService();
    const response = await runProtectedRequest(
      await issueCookie(service, { roles: ['publisher'] }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('Publisher content');
  });
});

describe('React Router JWT session middleware', () => {
  it('exposes no session for an anonymous request and creates no cookie', async () => {
    const response = await runSessionMiddleware({
      handle: (context) => expect(getSession(context)).toBeUndefined(),
      service: createTestService(),
    });

    expect(response.headers.has('Set-Cookie')).toBe(false);
  });

  it('validates the JWT cookie and exposes immutable claims to routes', async () => {
    const service = createTestService();
    const response = await runSessionMiddleware({
      cookie: await issueCookie(service, { roles: ['publisher'], subject: 'user-456' }),
      handle: (context) => {
        expect(getSession(context)).toMatchObject({
          roles: ['publisher'],
          sub: 'user-456',
        });
      },
      service,
    });

    expect(response.headers.has('Set-Cookie')).toBe(false);
  });

  it('treats a tampered JWT as anonymous and clears the invalid cookie', async () => {
    const service = createTestService();
    const cookie = await issueCookie(service);
    const signatureIndex = cookie.lastIndexOf('.') + 1;
    const signatureCharacter = cookie.at(signatureIndex);
    if (signatureCharacter === undefined) throw new Error('JWT signature is missing');
    const tamperedCookie = `${cookie.slice(0, signatureIndex)}${
      signatureCharacter === 'a' ? 'b' : 'a'
    }${cookie.slice(signatureIndex + 1)}`;
    const response = await runSessionMiddleware({
      cookie: tamperedCookie,
      handle: (context) => expect(getSession(context)).toBeUndefined(),
      service,
    });

    expect(response.headers.get('Set-Cookie')).toContain('fphd-test-session=');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('preserves route cookies when clearing an invalid JWT cookie', async () => {
    const response = await runSessionMiddleware({
      cookie: 'fphd-test-session=not-a-jwt',
      handle: (context) => expect(getSession(context)).toBeUndefined(),
      response: new Response(null, {
        headers: { 'Set-Cookie': 'route-cookie=value; Path=/' },
      }),
      service: createTestService(),
    });

    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie()[0]).toBe('route-cookie=value; Path=/');
    expect(response.headers.getSetCookie()[1]).toContain('fphd-test-session=');
  });
});
