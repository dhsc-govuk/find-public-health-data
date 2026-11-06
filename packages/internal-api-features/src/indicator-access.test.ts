import { addFallbackHandlers } from '@fphd/api-server';
import { canEditIndicator } from '@fphd/auth/permissions';
import { request } from '@fphd/express/testing';
import { Router } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { guardedIndicator, requireIndicatorAccess } from './indicator-access.ts';
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

const inTeam = (teamId: string | null): IndicatorAccessRow => ({ teamId, draftReviewers: [] });
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
    ["another team's indicator", inTeam(OTHER_TEAM_ID)],
    ['an indicator in no team', inTeam(null)],
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

  it('refuses a read or a write by a user who may see the indicator but not act on it', async () => {
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

describe('guardedIndicator', () => {
  it('fails loudly in a route no indicator guard runs before', async () => {
    const { app } = createTestApp(inTeam(TEST_TEAM_ID));

    const response = await request(app).get(`/unguarded/${ID}`);

    expect(response.status).toBe(500);
  });
});
