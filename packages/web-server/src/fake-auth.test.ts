import { FAKE_USER_IDS, fakeUsersForAudience, TEAM_IDS } from '@fphd/auth';
import { createJwtSessionService } from '@fphd/auth/jwt-session';
import { request } from '@fphd/express/testing';
import express from 'express';
import { describe, expect, it } from 'vitest';

import { createFakeAuthRouter } from './fake-auth.ts';

const session = createJwtSessionService({
  audience: 'fphd-internal',
  clock: () => new Date('2026-07-23T10:00:00.000Z'),
  cookieName: 'fphd-internal-session',
  issuer: 'fphd-auth',
  secret: 'a-jwt-session-secret-that-is-long-enough-for-tests',
  secure: false,
});

function createTestApp() {
  const app = express();
  app.use(
    createFakeAuthRouter({
      audience: 'internal',
      isPagePath: (path) => !path.startsWith('/auth/'),
      session,
      users: fakeUsersForAudience('internal'),
    }),
  );
  return app;
}

function requireHeader(value: string | undefined, name: string): string {
  if (value === undefined) throw new Error(`Missing ${name} header`);
  return value;
}

describe('fake authentication backend', () => {
  it('signs an internal user in through a one-use callback', async () => {
    const app = createTestApp();
    const start = await request(app).post('/auth/sign-in').type('form').send({
      returnTo: '/manage?view=drafts',
      userId: FAKE_USER_IDS.publisherTeamA,
    });

    expect(start.status).toBe(303);
    const callbackPath = requireHeader(start.get('Location'), 'Location');
    const callback = await request(app).get(callbackPath);

    expect(callback.status).toBe(303);
    expect(callback.get('Location')).toBe('/manage?view=drafts');

    const cookie = requireHeader(callback.get('Set-Cookie')?.[0], 'Set-Cookie');
    const token = session.readToken(cookie);
    if (token === undefined) throw new Error('Session cookie did not contain a token');

    await expect(session.verifyToken(token)).resolves.toMatchObject({
      roles: ['public', 'publisher'],
      sub: FAKE_USER_IDS.publisherTeamA,
      teams: [TEAM_IDS.teamA],
    });
    expect((await request(app).get(callbackPath)).status).toBe(400);
  });

  it('does not allow a public-only fake user to sign into the internal service', async () => {
    const response = await request(createTestApp()).post('/auth/sign-in').type('form').send({
      userId: FAKE_USER_IDS.publicUser,
    });

    expect(response.status).toBe(403);
    expect(response.text).toBe('This user cannot access this service.');
  });

  it('ignores a return address that is not one of the pages', async () => {
    const app = createTestApp();
    const start = await request(app).post('/auth/sign-in').type('form').send({
      returnTo: '/auth/sign-out',
      userId: FAKE_USER_IDS.publisherTeamA,
    });
    const callback = await request(app).get(requireHeader(start.get('Location'), 'Location'));

    expect(callback.get('Location')).toBe('/');
  });

  it('does not redirect to an external return URL', async () => {
    const app = createTestApp();
    const start = await request(app).post('/auth/sign-in').type('form').send({
      returnTo: '//example.com/steal-session',
      userId: FAKE_USER_IDS.publisherTeamA,
    });
    const callback = await request(app).get(requireHeader(start.get('Location'), 'Location'));

    expect(callback.get('Location')).toBe('/');
  });

  it('clears the session cookie on sign out', async () => {
    const response = await request(createTestApp()).post('/auth/sign-out').type('form').send({
      returnTo: '/sign-in',
    });

    expect(response.status).toBe(303);
    expect(response.get('Location')).toBe('/sign-in');
    expect(response.get('Set-Cookie')?.[0]).toContain('Max-Age=0');
  });

  it('sends a sign-out that names no page to the root', async () => {
    const response = await request(createTestApp()).post('/auth/sign-out').type('form').send({
      returnTo: '/auth/sign-in',
    });

    expect(response.get('Location')).toBe('/');
  });
  // This router sits in front of the whole app, so anything it reads is gone before React
  // Router sees it — and a form action's request.formData() would come back empty.
  it('leaves the body of a request it does not handle for whatever comes next', async () => {
    const app = express();
    app.use(
      createFakeAuthRouter({
        audience: 'internal',
        isPagePath: () => true,
        session,
        users: fakeUsersForAudience('internal'),
      }),
    );
    app.post('/manage/topics/1', async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      response.status(200).send(Buffer.concat(chunks).toString());
    });

    const response = await request(app)
      .post('/manage/topics/1')
      .type('form')
      .send({ title: 'Air quality' });

    expect(response.text).toBe('title=Air%20quality');
  });
});
