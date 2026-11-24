import { addFallbackHandlers } from '@fphd/api-server';
import { canEditIndicator } from '@fphd/auth/permissions';
import { request } from '@fphd/express/testing';
import { Router } from 'express';
import { describe, expect, it, vi } from 'vitest';

import {
  guardedIndicator,
  requireIndicatorAccess,
  requireIndicatorViewer,
} from './indicator-access.ts';
import type { IndicatorAccessRow } from './indicator-list-repository.ts';
import {
  createRouterTestApp,
  TEST_TEAM_ID,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TEAM_ID = '00000000-0000-7000-8000-00000000000b';

function createTestApp(
  row: IndicatorAccessRow | undefined,
  findAccess = vi.fn().mockResolvedValue(row),
) {
  const guard = requireIndicatorAccess(testSessionVerifier, { findAccess }, canEditIndicator);
  const router = Router();
  router.get('/indicators/:id', guard, (_request, response) => {
    response.status(200).json(guardedIndicator(response));
  });
  router.put('/indicators/:id', guard, (_request, response) => {
    response.status(200).json(guardedIndicator(response));
  });
  router.get('/unguarded/:id', (_request, response) => {
    response.status(200).json(guardedIndicator(response));
  });
  const app = createRouterTestApp(router);
  addFallbackHandlers(app);
  return { app, findAccess };
}

const inTeam = (teamId: string): IndicatorAccessRow => ({ teamId, draftReviewers: [] });
const publisher = () => testSessionCookie(['publisher']);

describe('requireIndicatorAccess', () => {
  it('hands the route the indicator a user its check admits may act on', async () => {
    const { app, findAccess } = createTestApp(inTeam(TEST_TEAM_ID));

    const response = await request(app)
      .put(`/indicators/${ID}`)
      .set('Cookie', await publisher());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: ID, access: { teamId: TEST_TEAM_ID, reviewerIds: [] } });
    expect(findAccess).toHaveBeenCalledOnce();
    expect(findAccess).toHaveBeenCalledWith(ID);
  });

  it('answers 400 for an id that is not one, without looking it up', async () => {
    const { app, findAccess } = createTestApp(inTeam(TEST_TEAM_ID));

    const response = await request(app)
      .get('/indicators/108')
      .set('Cookie', await publisher());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
    expect(findAccess).not.toHaveBeenCalled();
  });

  it.each([
    ['no such indicator', undefined],
    ["another team's indicator, which a publisher may see but not work on", inTeam(OTHER_TEAM_ID)],
  ])('answers a read or a write of %s as one that does not exist', async (_case, row) => {
    const { app } = createTestApp(row);

    for (const method of ['get', 'put'] as const) {
      const response = await request(app)
        [method](`/indicators/${ID}`)
        .set('Cookie', await publisher());

      expect(response.status, method).toBe(404);
      expect(response.body).toEqual({ error: 'not_found' });
    }
  });

  it('refuses a read or a write by a user who works on the indicator but may not act on it', async () => {
    const { app } = createTestApp(inTeam(TEST_TEAM_ID));

    for (const method of ['get', 'put'] as const) {
      const response = await request(app)
        [method](`/indicators/${ID}`)
        .set('Cookie', await testSessionCookie(['admin'], []));

      expect(response.status, method).toBe(403);
      expect(response.body).toEqual({ error: 'forbidden' });
    }
  });

  it('refuses a session without the internal roles before looking the indicator up', async () => {
    const { app, findAccess } = createTestApp(inTeam(TEST_TEAM_ID));

    const anonymous = await request(app).get(`/indicators/${ID}`);
    const noRole = await request(app)
      .get(`/indicators/${ID}`)
      .set('Cookie', await testSessionCookie([]));

    expect(anonymous.status).toBe(401);
    expect(noRole.status).toBe(403);
    expect(findAccess).not.toHaveBeenCalled();
  });

  it('answers a lookup that fails with a 500, rather than leaving the request open', async () => {
    const { app } = createTestApp(
      undefined,
      vi.fn().mockRejectedValue(new Error('the database is down')),
    );

    const response = await request(app)
      .put(`/indicators/${ID}`)
      .set('Cookie', await publisher());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'internal_error' });
  });
});

describe('requireIndicatorViewer', () => {
  function createViewerApp(row: IndicatorAccessRow | undefined) {
    const router = Router();
    router.get(
      '/indicators/:id',
      requireIndicatorViewer(testSessionVerifier, { findAccess: async () => row }),
      (_request, response) => {
        response.status(200).json(guardedIndicator(response));
      },
    );
    const app = createRouterTestApp(router);
    addFallbackHandlers(app);
    return app;
  }

  it("lets a publisher see another team's indicator", async () => {
    const response = await request(createViewerApp(inTeam(OTHER_TEAM_ID)))
      .get(`/indicators/${ID}`)
      .set('Cookie', await publisher());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: ID, access: { teamId: OTHER_TEAM_ID, reviewerIds: [] } });
  });

  it.each([
    ['no such indicator', undefined],
    ['an indicator not assigned to them', inTeam(TEST_TEAM_ID)],
  ])('answers an IMRG reviewer who does not publish %s as not found', async (_case, row) => {
    const response = await request(createViewerApp(row))
      .get(`/indicators/${ID}`)
      .set('Cookie', await testSessionCookie(['imrg-reviewer'], []));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('answers 400 for an id that is not one', async () => {
    const response = await request(createViewerApp(inTeam(TEST_TEAM_ID)))
      .get('/indicators/108')
      .set('Cookie', await publisher());

    expect(response.status).toBe(400);
  });
});

describe('guardedIndicator', () => {
  it('fails loudly in a route no indicator guard runs before', async () => {
    const { app } = createTestApp(inTeam(TEST_TEAM_ID));

    const response = await request(app).get(`/unguarded/${ID}`);

    expect(response.status).toBe(500);
  });
});
