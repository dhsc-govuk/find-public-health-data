import { TEAM_IDS } from '@fphd/auth';
import { request } from '@fphd/express/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { indicatorsToReviewSchema, indicatorsUnderReviewSchema } from './contract.ts';
import type { IndicatorAdminListRow } from './indicator-list-repository.ts';
import { internalIndicatorsUnderReviewRouter } from './indicators-under-review.ts';
import type { InternalIndicatorRepository } from './repositories.ts';
import {
  createRouterTestApp,
  TEST_USER_ID,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const path = '/api/internal/indicators-under-review';
const toReviewPath = '/api/internal/indicators-to-review';

const row: IndicatorAdminListRow = {
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Life expectancy at birth',
  teamId: TEAM_IDS.teamA,
  teamName: 'Team A',
  createdBy: 'Sam Taylor',
  updatedAt: new Date('2026-08-04T10:00:00.000Z'),
  lastEditedBy: 'Sam Taylor',
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: true,
  draftSubmissionStatus: 'submitted',
  draftReviewers: [],
};

const inReview: IndicatorAdminListRow = {
  ...row,
  id: '00000000-0000-7000-8000-000000000002',
  draftSubmissionStatus: 'in_review',
  draftReviewers: [{ id: '00000000-0000-7000-8000-0000000000a1', name: 'Jamie Evans' }],
};

function createTestApp(
  listUnderReview: InternalIndicatorRepository['listUnderReview'] = vi
    .fn()
    .mockResolvedValue({ unassigned: [row], assigned: [inReview] }),
  listToReview: InternalIndicatorRepository['listToReview'] = vi.fn().mockResolvedValue([inReview]),
): Express {
  return createRouterTestApp(
    internalIndicatorsUnderReviewRouter({ listUnderReview, listToReview }, testSessionVerifier),
  );
}

function managerCookie() {
  return testSessionCookie(['internal', 'imrg-manager'], []);
}

describe('GET /api/internal/indicators-under-review', () => {
  it('answers both tables in the shape the contract describes', async () => {
    const response = await request(createTestApp())
      .get(path)
      .set('Cookie', await managerCookie());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      unassigned: [{ ...row, updatedAt: '2026-08-04T10:00:00.000Z' }],
      assigned: [{ ...inReview, updatedAt: '2026-08-04T10:00:00.000Z' }],
    });
    expect(indicatorsUnderReviewSchema.safeParse(response.body).success).toBe(true);
  });

  it("lists the indicators the manager's scope lets them see", async () => {
    const listUnderReview = vi.fn().mockResolvedValue({ unassigned: [], assigned: [] });

    await request(createTestApp(listUnderReview))
      .get(path)
      .set('Cookie', await managerCookie());

    expect(listUnderReview).toHaveBeenCalledWith({ all: true });
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
});

describe('GET /api/internal/indicators-to-review', () => {
  function reviewerCookie() {
    return testSessionCookie(['internal', 'imrg-reviewer'], []);
  }

  it('answers the list in the shape the contract describes', async () => {
    const response = await request(createTestApp())
      .get(toReviewPath)
      .set('Cookie', await reviewerCookie());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      indicators: [{ ...inReview, updatedAt: '2026-08-04T10:00:00.000Z' }],
    });
    expect(indicatorsToReviewSchema.safeParse(response.body).success).toBe(true);
  });

  it('lists the indicators assigned to the signed-in reviewer', async () => {
    const listToReview = vi.fn().mockResolvedValue([]);

    await request(createTestApp(undefined, listToReview))
      .get(toReviewPath)
      .set('Cookie', await testSessionCookie(['internal', 'publisher', 'imrg-reviewer']));

    expect(listToReview).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp()).get(toReviewPath);

    expect(response.status).toBe(401);
  });

  it.each([
    ['a publisher', ['internal', 'publisher']],
    ['an admin', ['internal', 'admin']],
    ['an IMRG manager', ['internal', 'imrg-manager']],
  ])('rejects %s', async (_, roles) => {
    const response = await request(createTestApp())
      .get(toReviewPath)
      .set('Cookie', await testSessionCookie(roles));

    expect(response.status).toBe(403);
  });
});
