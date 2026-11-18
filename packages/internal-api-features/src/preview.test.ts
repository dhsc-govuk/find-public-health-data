import { TEAM_IDS } from '@fphd/auth';
import type { FoundIndicatorDetail } from '@fphd/db';
import { createFakeRepositories } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import { Router } from 'express';
import { describe, expect, it, vi } from 'vitest';

import {
  type InternalPreviewRepository,
  indicatorPreviewRouter,
  type PublicApiRoutes,
} from './preview.ts';
import type { PreviewRepositories } from './preview-repository.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  inTestTeam,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const INDICATOR_ID = '01a0d8a5-3ca2-7315-bfca-000000000001';
const PATH = `/api/internal/indicators/${INDICATOR_ID}/preview/api/indicators/108`;
const VERSION = { id: '01a0d8a5-3ca2-7315-bfca-000000000002', slug: 'a-draft' };

const found = { name: 'A draft', unanswered: ['polarity'] } as unknown as FoundIndicatorDetail;

function previewRepositories(): PreviewRepositories {
  return { ...createFakeRepositories(), findDataState: async () => 'no-upload' };
}

/**
 * The preview over public routes that answer the detail endpoint with what the preview's detail
 * gives them, as the real ones do, and record the repositories they were given.
 */
function createTestApp(preview: Partial<InternalPreviewRepository> = {}) {
  const given: PreviewRepositories[] = [];
  const publicRoutes: PublicApiRoutes = (repositories, { detailBody }) => {
    given.push(repositories as PreviewRepositories);
    return Router().get('/api/indicators/:indicator', async (_request, response) => {
      response.json(await detailBody(found, INDICATOR_ID));
    });
  };
  const repositories = createFakeInternalRepositories({
    indicators: inTestTeam,
    preview: {
      findVersion: async () => VERSION,
      repositoriesFor: previewRepositories,
      ...preview,
    },
  });
  const app = createRouterTestApp(
    indicatorPreviewRouter(
      repositories.preview,
      repositories.indicators,
      testSessionVerifier,
      publicRoutes,
    ),
  );
  return { app, given };
}

describe('the indicator preview API', () => {
  it('answers the public route with the detail as found and its data state', async () => {
    const response = await request(createTestApp().app)
      .get(PATH)
      .set('Cookie', await testSessionCookie(['publisher']));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...found, dataState: 'no-upload' });
  });

  it("gives the public routes repositories made for the indicator's draft, each request", async () => {
    const repositoriesFor = vi.fn(previewRepositories);
    const { app, given } = createTestApp({ repositoriesFor });
    const cookie = await testSessionCookie(['publisher']);

    await request(app).get(PATH).set('Cookie', cookie);
    await request(app).get(PATH).set('Cookie', cookie);

    expect(repositoriesFor).toHaveBeenCalledTimes(2);
    expect(repositoriesFor).toHaveBeenCalledWith(VERSION);
    expect(given[0]).not.toBe(given[1]);
  });

  it('refuses a user who cannot see the overview, as not found', async () => {
    const findVersion = vi.fn();
    const response = await request(createTestApp({ findVersion }).app)
      .get(PATH)
      .set('Cookie', await testSessionCookie(['publisher'], [TEAM_IDS.teamB]));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
    expect(findVersion).not.toHaveBeenCalled();
  });

  it('refuses a request with no session', async () => {
    const response = await request(createTestApp().app).get(PATH);

    expect(response.status).toBe(401);
  });

  it('answers not found for an indicator with no draft or scheduled version', async () => {
    const response = await request(createTestApp({ findVersion: async () => undefined }).app)
      .get(PATH)
      .set('Cookie', await testSessionCookie(['publisher']));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });
});
