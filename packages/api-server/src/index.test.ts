import { createJwtSessionService, createJwtSessionVerifier } from '@fphd/auth/jwt-session';
import { request } from '@fphd/express/testing';
import { createLogger } from '@fphd/logger';
import { createCapturingLogger } from '@fphd/logger/testing';
import express, { type Express } from 'express';
import { describe, expect, it } from 'vitest';

import {
  addFallbackHandlers,
  createApiApp,
  requireApiActor,
  requireApiSession,
  requireJwtRole,
  requireJwtSession,
} from './index.ts';

const logger = createLogger({ name: 'test-api', level: 'silent' });

describe('API server', () => {
  // The probes themselves are `@fphd/express`'s; this only asserts an API app is built on it,
  // and passes its own name through.
  it('serves the shared probes under its own service name', async () => {
    const app = createApiApp({ logger, serviceName: 'test-api' });

    const live = await request(app).get('/livez');
    const ready = await request(app).get('/readyz');

    expect(live.status).toBe(200);
    expect(ready.status).toBe(200);
    expect(live.body).toEqual({ status: 'ok', service: 'test-api' });
  });

  it('sends the security headers that apply to a JSON response too', async () => {
    const app = createApiApp({ logger, serviceName: 'test-api' });

    const response = await request(app).get('/api');

    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves only the shared public route table', async () => {
    const app = createApiApp({ logger, serviceName: 'test-api' });
    addFallbackHandlers(app);

    const publicResponse = await request(app).get('/api');
    const internalResponse = await request(app).get('/api/internal');

    expect(publicResponse.status).toBe(200);
    expect(internalResponse.status).toBe(404);
  });

  // The line's shape is `@fphd/express`'s; this asserts an API app writes one at all, under its
  // own name, which is what FPH-316's verification found missing.
  it('logs each request through the logger it was given', async () => {
    const { logger, lines } = createCapturingLogger('test-api');
    const app = createApiApp({ logger, serviceName: 'test-api' });
    addFallbackHandlers(app);

    await request(app).get('/api');
    await request(app).get('/api/nowhere');
    await request(app).get('/livez');
    await new Promise((resolve) => setImmediate(resolve));

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ name: 'test-api', req: { method: 'GET', url: '/api' } });
    expect(lines[1]).toMatchObject({ res: { statusCode: 404 } });
  });

  it('logs a call under the id the web app forwarded', async () => {
    const { logger, lines } = createCapturingLogger('test-api');
    const app = createApiApp({ logger, serviceName: 'test-api' });

    await request(app).get('/api').set('X-Fphd-Request-Id', '019924a1-2c40-7000-8000-000000000001');
    await new Promise((resolve) => setImmediate(resolve));

    expect(lines[0]).toMatchObject({ req: { id: '019924a1-2c40-7000-8000-000000000001' } });
  });
});

describe('addFallbackHandlers', () => {
  function createLoggingApp(): { app: Express; lines: Record<string, unknown>[] } {
    const { logger, lines } = createCapturingLogger('test-api');
    const app = createApiApp({ logger, serviceName: 'test-api' });

    app.post('/api/echo', (request, response) => {
      response.status(200).json(request.body);
    });
    app.get('/api/broken', async () => {
      throw new Error('The repository failed');
    });
    app.get('/api/borrowed-type', async () => {
      throw Object.assign(new Error('Not from body-parser'), { type: 'entity.parse.failed' });
    });
    addFallbackHandlers(app);

    return { app, lines };
  }

  it('answers a thrown error with a JSON 500 and logs the error on the request line', async () => {
    const { app, lines } = createLoggingApp();

    const response = await request(app).get('/api/broken');
    await new Promise((resolve) => setImmediate(resolve));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'internal_error' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 50,
      req: { id: response.get('X-Fphd-Request-Id') },
      err: { message: 'The repository failed' },
    });
  });

  it('refuses a body that is not JSON with a JSON 400', async () => {
    const response = await request(createLoggingApp().app)
      .post('/api/echo')
      .set('Content-Type', 'application/json')
      .send('{"name":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_json' });
  });

  it('answers a 500 for an error that only shares a body-parser type', async () => {
    const response = await request(createLoggingApp().app).get('/api/borrowed-type');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'internal_error' });
  });

  it('refuses a body over the size limit with a JSON 413', async () => {
    const response = await request(createLoggingApp().app)
      .post('/api/echo')
      .send({ name: 'x'.repeat(200_000) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'payload_too_large' });
  });
});

const session = createJwtSessionService({
  audience: 'fphd-internal',
  clock: () => new Date('2026-08-04T10:00:00.000Z'),
  cookieName: 'fphd-internal-session',
  issuer: 'fphd-auth',
  secret: 'a-jwt-session-secret-that-is-long-enough-for-tests',
  secure: false,
});
const verifier = createJwtSessionVerifier(session);

function createGuardedApp(): Express {
  const app = express();

  app.get('/guarded', requireJwtRole(verifier, 'publisher'), (_request, response) => {
    response.status(200).json(requireApiSession(response));
  });
  app.get(
    '/checked',
    requireJwtSession(verifier, (asking) => asking.teams.includes('team-1')),
    (_request, response) => {
      response.status(200).json(requireApiSession(response));
    },
  );
  app.get('/unguarded', (_request, response) => {
    response.status(200).json(requireApiSession(response));
  });

  return app;
}

async function cookieFor(subject: string, roles: readonly string[], teams: readonly string[] = []) {
  const token = await session.issueToken({ expiresInSeconds: 900, roles, subject, teams });
  return session.createCookieHeader(token, 900);
}

describe('requireJwtRole', () => {
  it('refuses a request carrying no session', async () => {
    const response = await request(createGuardedApp()).get('/guarded');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication_required' });
  });

  it('clears the cookie of a session it cannot verify', async () => {
    const response = await request(createGuardedApp())
      .get('/guarded')
      .set('Cookie', 'fphd-internal-session=not-a-jwt');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'invalid_session' });
    expect(response.get('Set-Cookie')?.[0]).toContain('Max-Age=0');
  });

  it('refuses a session without the role', async () => {
    const response = await request(createGuardedApp())
      .get('/guarded')
      .set('Cookie', await cookieFor('someone', ['internal']));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
  });

  it('hands the verified subject, roles and teams to the handler behind it', async () => {
    const response = await request(createGuardedApp())
      .get('/guarded')
      .set('Cookie', await cookieFor('publisher-1', ['internal', 'publisher'], ['team-1']));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      roles: ['internal', 'publisher'],
      sub: 'publisher-1',
      teams: ['team-1'],
    });
  });
});

describe('requireJwtSession', () => {
  it('admits the sessions its check admits and refuses the rest', async () => {
    const app = createGuardedApp();
    const admitted = await request(app)
      .get('/checked')
      .set('Cookie', await cookieFor('in-team', ['internal'], ['team-1']));
    const refused = await request(app)
      .get('/checked')
      .set('Cookie', await cookieFor('elsewhere', ['internal'], ['team-2']));

    expect(admitted.status).toBe(200);
    expect(admitted.body).toMatchObject({ sub: 'in-team' });
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({ error: 'forbidden' });
  });
});

describe('requireApiSession', () => {
  it('fails loudly in a handler no role guard runs before', async () => {
    const response = await request(createGuardedApp()).get('/unguarded');

    expect(response.status).toBe(500);
  });
});

describe('requireApiActor', () => {
  it("gives the signed-in user and the request's id", async () => {
    const app = createApiApp({ logger, serviceName: 'test-api' });
    app.get('/acting', requireJwtRole(verifier, 'publisher'), (request, response) => {
      response.status(200).json(requireApiActor(request, response));
    });

    const response = await request(app)
      .get('/acting')
      .set('Cookie', await cookieFor('user-1', ['publisher']));

    expect(response.body).toEqual({
      userId: 'user-1',
      requestId: response.headers['x-fphd-request-id'],
    });
  });

  it('gives no request id where nothing assigned one', async () => {
    const app = express();
    app.get('/acting', requireJwtRole(verifier, 'publisher'), (request, response) => {
      response.status(200).json(requireApiActor(request, response));
    });

    const response = await request(app)
      .get('/acting')
      .set('Cookie', await cookieFor('user-1', ['publisher']));

    expect(response.body).toEqual({ userId: 'user-1', requestId: null });
  });
});
