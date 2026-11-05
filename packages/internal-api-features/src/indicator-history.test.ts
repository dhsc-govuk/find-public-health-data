import { TEAM_IDS } from '@fphd/auth';
import { request } from '@fphd/express/testing';
import type { Express } from 'express';
import { describe, expect, it } from 'vitest';

import { indicatorHistorySchema } from './contract.ts';
import { indicatorHistoryRouter } from './indicator-history.ts';
import type { IndicatorHistoryRow } from './indicator-history-repository.ts';
import type { InternalIndicatorRepository } from './repositories.ts';
import {
  createRouterTestApp,
  TEST_TEAM_ID,
  TEST_USER_ID,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const path = `/api/internal/indicators/${ID}/history`;

const found: IndicatorHistoryRow = {
  teamId: TEST_TEAM_ID,
  draftReviewers: [{ id: '00000000-0000-7000-8000-0000000000a1', name: 'Jamie Evans' }],
  versions: [
    {
      createdAt: '2026-06-01T09:00:00.123456+00:00',
      createdBy: 'Sam Taylor',
      publishedAt: null,
    },
  ],
  submissions: [
    {
      versionId: '00000000-0000-7000-8000-0000000000d1',
      status: 'in_review',
      previousStatus: null,
      submittedAt: '2026-06-02T09:00:00+00:00',
      submittedBy: 'Sam Taylor',
      endedAt: null,
      endedBy: null,
      revisionResponse: null,
      responses: [],
    },
  ],
  assignments: [
    {
      at: '2026-06-02T10:00:00+00:00',
      by: 'Avery Clarke',
      reviewers: ['Jamie Evans'],
    },
  ],
  saves: [],
};

type Indicators = Pick<InternalIndicatorRepository, 'findHistory'>;

function createTestApp(findHistory: Indicators['findHistory'] = async () => found): Express {
  return createRouterTestApp(indicatorHistoryRouter({ findHistory }, testSessionVerifier));
}

const asManager = () => testSessionCookie(['internal', 'imrg-manager'], []);

describe('GET /api/internal/indicators/:id/history', () => {
  it('serves the entries newest first, as the contract gives them', async () => {
    const response = await request(createTestApp())
      .get(path)
      .set('Cookie', await asManager());

    expect(response.status).toBe(200);
    expect(indicatorHistorySchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      entries: [
        {
          kind: 'reviewers_assigned',
          at: '2026-06-02T10:00:00.000Z',
          by: 'Avery Clarke',
          reviewers: ['Jamie Evans'],
        },
        { kind: 'submitted', at: '2026-06-02T09:00:00.000Z', by: 'Sam Taylor' },
        { kind: 'created', at: '2026-06-01T09:00:00.123Z', by: 'Sam Taylor' },
      ],
    });
  });

  it.each([
    ['an admin', ['internal', 'admin'], []],
    ['a publisher in its team', ['internal', 'publisher'], [TEST_TEAM_ID]],
  ])('serves %s', async (_, roles, teams) => {
    const response = await request(createTestApp())
      .get(path)
      .set('Cookie', await testSessionCookie(roles, teams));

    expect(response.status).toBe(200);
  });

  it('serves a reviewer assigned to the indicator', async () => {
    const assigned = { ...found, draftReviewers: [{ id: TEST_USER_ID, name: 'Sam Taylor' }] };
    const response = await request(createTestApp(async () => assigned))
      .get(path)
      .set('Cookie', await testSessionCookie(['internal', 'imrg-reviewer'], []));

    expect(response.status).toBe(200);
  });

  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp()).get(path);

    expect(response.status).toBe(401);
  });

  it.each([
    ['a publisher in another team', ['internal', 'publisher'], [TEAM_IDS.teamB]],
    ['a reviewer not assigned to it', ['internal', 'imrg-reviewer'], []],
  ])('answers %s as if it did not exist', async (_, roles, teams) => {
    const response = await request(createTestApp())
      .get(path)
      .set('Cookie', await testSessionCookie(roles, teams));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('answers 400 for an id that is not one', async () => {
    const response = await request(createTestApp())
      .get('/api/internal/indicators/not-an-id/history')
      .set('Cookie', await asManager());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it('answers 404 for an indicator that does not exist', async () => {
    const response = await request(createTestApp(async () => undefined))
      .get(path)
      .set('Cookie', await asManager());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });
});
