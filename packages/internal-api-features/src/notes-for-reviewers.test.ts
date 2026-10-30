import { TEAM_IDS } from '@fphd/auth';
import { request } from '@fphd/express/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { notesForReviewersSchema } from './contract.ts';
import type { IndicatorAdminDetailRow } from './indicator-list-repository.ts';
import { internalNotesForReviewersRouter } from './notes-for-reviewers.ts';
import type { InternalIndicatorRepository } from './repositories.ts';
import {
  createRouterTestApp,
  TEST_TEAM_ID,
  TEST_USER_ID,
  testSessionCookie,
  testSessionVerifier,
  unansweredDraft,
} from './testing.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const path = `/api/internal/indicators/${ID}/notes-for-reviewers`;

/** A submitted draft in review, its reviewer someone other than the test user. */
const inReview: IndicatorAdminDetailRow = {
  id: ID,
  shortId: 90366,
  name: 'Life expectancy at birth',
  teamId: TEST_TEAM_ID,
  publishedSlug: null,
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: true,
  draftSubmissionStatus: 'in_review',
  draftSubmissionNumber: 1,
  draftReviewers: [{ id: '00000000-0000-7000-8000-0000000000a1', name: 'Jamie Evans' }],
  draftScheduledPublishAt: null,
};

const assignedToTestUser: IndicatorAdminDetailRow = {
  ...inReview,
  draftReviewers: [{ id: TEST_USER_ID, name: 'Sam Taylor' }],
};

// The draft as the repository reads it; the router reads only its columns.
const draftState = {
  id: ID,
  shortId: 90366,
  teamId: TEST_TEAM_ID,
  draft: {
    ...unansweredDraft,
    isLocked: true,
    variation: 'Little.',
    qualityAssurance: 'Checked.',
    hasSourceDataIssues: true,
    sourceDataIssuesDetail: 'Late returns.',
    ciMethodJustification: 'Standard.',
    hasExclusions: false,
    hasReviewerComments: true,
    reviewerCommentsDetail: 'Please look at 2020.',
  },
  draftCiMethodKind: null,
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftSubmissionStatus: 'in_review',
};

type Indicators = Pick<
  InternalIndicatorRepository,
  'findById' | 'findDraftState' | 'findPublishedVersion'
>;

function createTestApp(indicators: Partial<Indicators> = {}): Express {
  return createRouterTestApp(
    internalNotesForReviewersRouter(
      {
        findById: async () => inReview,
        findDraftState: vi.fn().mockResolvedValue(draftState),
        findPublishedVersion: vi.fn(),
        ...indicators,
      },
      testSessionVerifier,
    ),
  );
}

const asManager = () => testSessionCookie(['internal', 'imrg-manager'], []);
const asReviewer = () => testSessionCookie(['internal', 'imrg-reviewer'], []);

describe('GET /api/internal/indicators/:id/notes-for-reviewers', () => {
  it("serves an IMRG manager the draft's answers", async () => {
    const response = await request(createTestApp())
      .get(path)
      .set('Cookie', await asManager());

    expect(response.status).toBe(200);
    expect(notesForReviewersSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      varianceAndQuality: {
        variation: 'Little.',
        qualityAssurance: 'Checked.',
        hasSourceDataIssues: 'yes',
        sourceDataIssuesDetail: 'Late returns.',
      },
      justifications: {
        ciMethodJustification: 'Standard.',
        dataSourcesJustification: null,
        inequalitiesIncluded: null,
        hasExclusions: 'no',
        exclusionsDetail: null,
        hasAutomation: null,
        automationDetail: null,
      },
      otherComments: {
        sponsorsAndStakeholders: null,
        hasReviewerComments: 'yes',
        reviewerCommentsDetail: 'Please look at 2020.',
      },
    });
  });

  it.each([
    ['before it is submitted', false, null],
    ['while the submission waits for reviewers', true, 'submitted'],
    ['after its submission is withdrawn', false, 'withdrawn'],
  ] as const)('serves them %s', async (_, draftLocked, draftSubmissionStatus) => {
    const response = await request(
      createTestApp({
        findById: async () => ({
          ...inReview,
          draftLocked,
          draftSubmissionStatus,
          draftReviewers: [],
        }),
      }),
    )
      .get(path)
      .set('Cookie', await asManager());

    expect(response.status).toBe(200);
    expect(response.body.varianceAndQuality.variation).toBe('Little.');
  });

  it('serves a reviewer assigned to the indicator', async () => {
    const response = await request(createTestApp({ findById: async () => assignedToTestUser }))
      .get(path)
      .set('Cookie', await asReviewer());

    expect(response.status).toBe(200);
  });

  it.each([
    ['an admin', ['internal', 'admin'], []],
    // The draft is locked while in review, so this is exactly what they submitted.
    ['a publisher in its team', ['internal', 'publisher'], [TEST_TEAM_ID]],
  ])('serves %s', async (_, roles, teams) => {
    const response = await request(createTestApp())
      .get(path)
      .set('Cookie', await testSessionCookie(roles, teams));

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
    const findDraftState = vi.fn();

    const response = await request(createTestApp({ findDraftState }))
      .get(path)
      .set('Cookie', await testSessionCookie(roles, teams));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
    expect(findDraftState).not.toHaveBeenCalled();
  });

  it('answers 400 for an id that is not one', async () => {
    const response = await request(createTestApp())
      .get('/api/internal/indicators/not-an-id/notes-for-reviewers')
      .set('Cookie', await asManager());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it('answers 404 for an indicator that does not exist', async () => {
    const response = await request(createTestApp({ findById: async () => undefined }))
      .get(path)
      .set('Cookie', await asManager());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it("serves the published version's answers for a live indicator with no draft", async () => {
    const findDraftState = vi.fn();
    const findPublishedVersion = vi
      .fn()
      .mockResolvedValue({ ...unansweredDraft, variation: 'As published.' });

    const response = await request(
      createTestApp({
        findById: async () => ({
          ...inReview,
          indicatorStatus: 'live',
          draftStatus: null,
          draftLocked: false,
          draftSubmissionStatus: null,
          draftSubmissionNumber: null,
          draftReviewers: [],
        }),
        findDraftState,
        findPublishedVersion,
      }),
    )
      .get(path)
      .set('Cookie', await asManager());

    expect(response.status).toBe(200);
    expect(response.body.varianceAndQuality.variation).toBe('As published.');
    expect(findPublishedVersion).toHaveBeenCalledWith(ID);
    expect(findDraftState).not.toHaveBeenCalled();
  });
});
