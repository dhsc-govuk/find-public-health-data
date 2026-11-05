import { addFallbackHandlers } from '@fphd/api-server';
import { request } from '@fphd/express/testing';
import { Router } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { requireIndicatorEditor } from './indicator-editor.ts';
import {
  createRouterTestApp,
  TEST_TEAM_ID,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TEAM_ID = '00000000-0000-7000-8000-00000000000b';

function createTestApp(
  teamId: string | null | undefined,
  findTeamId = vi.fn().mockResolvedValue(teamId),
) {
  const guard = requireIndicatorEditor(testSessionVerifier, { findTeamId });
  const router = Router();
  router.get('/indicators/:id', guard, (_request, response) => {
    response.status(200).json({ reached: true });
  });
  router.put('/indicators/:id', guard, (_request, response) => {
    response.status(200).json({ reached: true });
  });
  const app = createRouterTestApp(router);
  addFallbackHandlers(app);
  return { app, findTeamId };
}

const publisher = () => testSessionCookie(['publisher']);

describe('requireIndicatorEditor', () => {
  it("lets a publisher through to their own team's indicator", async () => {
    const { app, findTeamId } = createTestApp(TEST_TEAM_ID);

    const response = await request(app)
      .put(`/indicators/${ID}`)
      .set('Cookie', await publisher());

    expect(response.status).toBe(200);
    expect(findTeamId).toHaveBeenCalledWith(ID);
  });

  it("answers a read of another team's indicator as one that does not exist", async () => {
    const { app } = createTestApp(OTHER_TEAM_ID);

    const response = await request(app)
      .get(`/indicators/${ID}`)
      .set('Cookie', await publisher());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it("answers a HEAD for another team's indicator as a read", async () => {
    const { app } = createTestApp(OTHER_TEAM_ID);

    const response = await request(app)
      .head(`/indicators/${ID}`)
      .set('Cookie', await publisher());

    expect(response.status).toBe(404);
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

  it("refuses a write to another team's indicator, or one in no team", async () => {
    for (const teamId of [OTHER_TEAM_ID, null]) {
      const { app } = createTestApp(teamId);

      const response = await request(app)
        .put(`/indicators/${ID}`)
        .set('Cookie', await publisher());

      expect(response.status, String(teamId)).toBe(403);
      expect(response.body).toEqual({ error: 'forbidden' });
    }
  });

  it('leaves an indicator that does not exist, or an id that is not one, to the route', async () => {
    const missing = createTestApp(undefined);
    const malformed = createTestApp(TEST_TEAM_ID);

    const absent = await request(missing.app)
      .put(`/indicators/${ID}`)
      .set('Cookie', await publisher());
    const unparsed = await request(malformed.app)
      .put('/indicators/108')
      .set('Cookie', await publisher());

    expect(absent.status).toBe(200);
    expect(unparsed.status).toBe(200);
    expect(malformed.findTeamId).not.toHaveBeenCalled();
  });

  it('refuses anyone but a publisher before looking the indicator up', async () => {
    const { app, findTeamId } = createTestApp(TEST_TEAM_ID);

    const response = await request(app)
      .put(`/indicators/${ID}`)
      .set('Cookie', await testSessionCookie(['admin']));

    expect(response.status).toBe(403);
    expect(findTeamId).not.toHaveBeenCalled();
  });
});
