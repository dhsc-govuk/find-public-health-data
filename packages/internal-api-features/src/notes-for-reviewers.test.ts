import { TEAM_IDS } from '@fphd/auth';
import { request } from '@fphd/express/testing';
import type { Express } from 'express';
import { describe, expect, it } from 'vitest';

import { notesForReviewersSchema } from './contract.ts';
import type { IndicatorNotesForReviewersRow } from './indicator-draft-repository.ts';
import type { IndicatorAccessRow } from './indicator-list-repository.ts';
import { internalNotesForReviewersRouter } from './notes-for-reviewers.ts';
import type { InternalIndicatorRepository } from './repositories.ts';
import {
  createRouterTestApp,
  TEST_TEAM_ID,
  TEST_USER_ID,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const path = `/api/internal/indicators/${ID}/notes-for-reviewers`;

// Whether these come from the draft or the published version is the repository's choice.
const found: IndicatorNotesForReviewersRow = {
  version: {
    id: '00000000-0000-7000-8000-0000000000d1',
    variation: 'Little.',
    qualityAssurance: 'Checked.',
    sourceDataIssuesDetail: 'Chasing late returns.',
    ciMethodJustification: 'Standard.',
    dataSourcesJustification: null,
    inequalitiesIncluded: null,
    hasExclusions: false,
    exclusionsDetail: null,
    hasAutomation: false,
    automationDetail: null,
    noAutomationReason: 'No tool reads this source.',
    sponsorsAndStakeholders: null,
    hasReviewerComments: true,
    reviewerCommentsDetail: 'Please look at 2020.',
  },
};

/** What the guard reads of the indicator: in the test team, with someone else reviewing it. */
const access: IndicatorAccessRow = {
  teamId: TEST_TEAM_ID,
  draftReviewers: [{ id: '00000000-0000-7000-8000-0000000000a1', name: 'Jamie Evans' }],
};

const assignedToTestUser: IndicatorAccessRow = {
  ...access,
  draftReviewers: [{ id: TEST_USER_ID, name: 'Sam Taylor' }],
};

type Indicators = Pick<InternalIndicatorRepository, 'findNotesForReviewers'>;

function createTestApp(
  findAccess: () => Promise<IndicatorAccessRow | undefined> = async () => access,
  findNotesForReviewers: Indicators['findNotesForReviewers'] = async () => found,
): Express {
  return createRouterTestApp(
    internalNotesForReviewersRouter({ findAccess, findNotesForReviewers }, testSessionVerifier),
  );
}

const asManager = () => testSessionCookie(['imrg-manager'], []);
const asReviewer = () => testSessionCookie(['imrg-reviewer'], []);

describe('GET /api/internal/indicators/:id/notes-for-reviewers', () => {
  it('serves an IMRG manager the answers as the section endpoints give them', async () => {
    const response = await request(createTestApp())
      .get(path)
      .set('Cookie', await asManager());

    expect(response.status).toBe(200);
    expect(notesForReviewersSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({
      varianceAndQuality: {
        variation: 'Little.',
        qualityAssurance: 'Checked.',
        sourceDataIssuesDetail: 'Chasing late returns.',
      },
      justifications: {
        ciMethodJustification: 'Standard.',
        dataSourcesJustification: null,
        inequalitiesIncluded: null,
        hasExclusions: 'no',
        exclusionsDetail: null,
        hasAutomation: 'no',
        automationDetail: null,
        noAutomationReason: 'No tool reads this source.',
      },
      otherComments: {
        sponsorsAndStakeholders: null,
        hasReviewerComments: 'yes',
        reviewerCommentsDetail: 'Please look at 2020.',
      },
    });
  });

  it('serves a reviewer assigned to the indicator', async () => {
    const response = await request(createTestApp(async () => assignedToTestUser))
      .get(path)
      .set('Cookie', await asReviewer());

    expect(response.status).toBe(200);
  });

  it.each([
    ['an admin', ['admin'], []],
    ['a publisher in its team', ['publisher'], [TEST_TEAM_ID]],
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
    ['a publisher in another team', ['publisher'], [TEAM_IDS.teamB]],
    ['a reviewer not assigned to it', ['imrg-reviewer'], []],
  ])('answers %s as if it did not exist', async (_, roles, teams) => {
    const response = await request(createTestApp())
      .get(path)
      .set('Cookie', await testSessionCookie(roles, teams));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('answers 400 for an id that is not one', async () => {
    const response = await request(createTestApp())
      .get('/api/internal/indicators/not-an-id/notes-for-reviewers')
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
