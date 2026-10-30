import { request } from '@fphd/express/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { type ReviewerOption, reviewerOptionsSchema } from './contract.ts';
import type { IndicatorAdminDetailRow } from './indicator-list-repository.ts';
import type { InternalIndicatorRepository } from './repositories.ts';
import { internalReviewersRouter } from './reviewers.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  type FakeInternalRepositoryOverrides,
  TEST_TEAM_ID,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const path = `/api/internal/indicators/${ID}/reviewer-options`;

const reviewers: ReviewerOption[] = [
  { id: '00000000-0000-7000-8000-0000000000a1', name: 'Jamie Evans', assignedIndicatorCount: 2 },
  { id: '00000000-0000-7000-8000-0000000000a2', name: 'Morgan Hughes', assignedIndicatorCount: 0 },
];

const submitted: IndicatorAdminDetailRow = {
  id: ID,
  shortId: 90366,
  name: 'Life expectancy at birth',
  teamId: TEST_TEAM_ID,
  publishedSlug: null,
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: true,
  draftSubmissionStatus: 'submitted',
  draftSubmissionNumber: 1,
  draftReviewers: [],
  draftScheduledPublishAt: null,
};

function createTestApp(
  overrides: FakeInternalRepositoryOverrides['reviewers'] = {},
  indicators: Pick<InternalIndicatorRepository, 'findById'> = { findById: async () => submitted },
): Express {
  const repositories = createFakeInternalRepositories({ reviewers: overrides });

  return createRouterTestApp(
    internalReviewersRouter(repositories.reviewers, indicators, testSessionVerifier),
  );
}

function managerCookie() {
  return testSessionCookie(['internal', 'imrg-manager'], []);
}

describe('GET /api/internal/indicators/:id/reviewer-options', () => {
  it("answers the indicator's reviewers in the shape the contract describes", async () => {
    const listOptions = vi.fn().mockResolvedValue(reviewers);

    const response = await request(createTestApp({ listOptions }))
      .get(path)
      .set('Cookie', await managerCookie());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reviewers });
    expect(reviewerOptionsSchema.safeParse(response.body).success).toBe(true);
    expect(listOptions).toHaveBeenCalledWith(ID);
  });

  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp()).get(path);

    expect(response.status).toBe(401);
  });

  it.each([
    ['a publisher', ['internal', 'publisher']],
    ['an admin', ['internal', 'admin']],
    ['a reviewer', ['internal', 'imrg-reviewer']],
  ])('rejects %s', async (_, roles) => {
    const response = await request(createTestApp())
      .get(path)
      .set('Cookie', await testSessionCookie(roles));

    expect(response.status).toBe(403);
  });

  it('answers 400 for an id that is not one', async () => {
    const response = await request(createTestApp())
      .get('/api/internal/indicators/not-an-id/reviewer-options')
      .set('Cookie', await managerCookie());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it('answers 404 for an indicator that does not exist', async () => {
    const listOptions = vi.fn();

    const response = await request(
      createTestApp({ listOptions }, { findById: async () => undefined }),
    )
      .get(path)
      .set('Cookie', await managerCookie());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
    expect(listOptions).not.toHaveBeenCalled();
  });
});
