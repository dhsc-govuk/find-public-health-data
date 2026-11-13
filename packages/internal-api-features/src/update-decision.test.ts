import { request } from '@fphd/express/testing';
import type { Logger } from '@fphd/logger';
import { createCapturingLogger } from '@fphd/logger/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { IndicatorAdminDetailRow } from './indicator-list-repository.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  type FakeInternalRepositoryOverrides,
  handlerLogLines,
  testActor,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';
import { updateDecisionRouter } from './update-decision.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const TEAM_ID = '00000000-0000-7000-8000-00000000000b';
const PATH = `/api/internal/indicators/${ID}/update-decision`;

const submittedUpdateRow: IndicatorAdminDetailRow = {
  id: ID,
  name: 'Life expectancy at birth',
  teamId: TEAM_ID,
  updatedAt: new Date('2026-10-22T09:30:00.123Z'),
  indicatorStatus: 'live',
  draftStatus: 'draft',
  draftLocked: true,
  draftSubmissionStatus: 'submitted',
  draftResponseKind: null,
  draftUpdateDecision: null,
  draftReviewers: [],
  shortId: 90366,
  publishedSlug: 'life-expectancy-at-birth',
  draftSubmissionNumber: 2,
  draftScheduledPublishAt: new Date('2027-01-04T09:30:00.000Z'),
  draftFirstSubmittedAt: new Date('2026-10-20T09:30:00.000Z'),
  draftResponse: null,
};

const revisions = {
  submissionNumber: 2,
  decision: 'request_revisions',
  clarificationRequest: null,
  flags: [{ task: 'update-summary', notes: '  Say what changed.  ' }],
};

function createTestApp(
  overrides: FakeInternalRepositoryOverrides['indicators'] = {},
  logger?: Logger,
): Express {
  const repositories = createFakeInternalRepositories({
    indicators: { findAccess: async () => submittedUpdateRow, ...overrides },
  });

  return createRouterTestApp(
    updateDecisionRouter(
      repositories.indicators,
      testSessionVerifier,
      () => new Date('2026-11-02T12:00:00.000Z'),
    ),
    logger,
  );
}

function adminCookie() {
  return testSessionCookie(['admin'], []);
}

describe('POST /api/internal/indicators/:id/update-decision', () => {
  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp())
      .post(PATH)
      .send({ submissionNumber: 2, decision: 'imrg_review' });

    expect(response.status).toBe(401);
  });

  it.each([
    ['a publisher of its team', ['publisher'], [TEAM_ID]],
    ['the IMRG manager', ['imrg-manager'], []],
  ])('refuses %s', async (_, roles, teams) => {
    const decideUpdate = vi.fn();

    const response = await request(createTestApp({ decideUpdate }))
      .post(PATH)
      .set('Cookie', await testSessionCookie(roles, teams))
      .send({ submissionNumber: 2, decision: 'imrg_review' });

    expect(response.status).toBe(403);
    expect(decideUpdate).not.toHaveBeenCalled();
  });

  it.each(['imrg_review', 'publish_with_history', 'publish_without_history'] as const)(
    'records the %s decision as the signed-in admin, answering 204, and logs it',
    async (decision) => {
      const { logger, lines } = createCapturingLogger('internal-api');
      const decideUpdate = vi.fn().mockResolvedValue({ ok: true });

      const response = await request(createTestApp({ decideUpdate }, logger))
        .post(PATH)
        .set('Cookie', await adminCookie())
        .send({ submissionNumber: 2, decision });

      expect(response.status).toBe(204);
      expect(decideUpdate).toHaveBeenCalledWith(
        ID,
        { submissionNumber: 2, decision },
        testActor(response),
      );
      expect(await handlerLogLines(lines)).toEqual([
        expect.objectContaining({ msg: 'Update decision recorded', indicatorId: ID, decision }),
      ]);
    },
  );

  it('records a request for revisions with its notes trimmed', async () => {
    const decideUpdate = vi.fn().mockResolvedValue({ ok: true });

    const response = await request(createTestApp({ decideUpdate }))
      .post(PATH)
      .set('Cookie', await adminCookie())
      .send(revisions);

    expect(response.status).toBe(204);
    expect(decideUpdate).toHaveBeenCalledWith(
      ID,
      { ...revisions, flags: [{ task: 'update-summary', notes: 'Say what changed.' }] },
      testActor(response),
    );
  });

  it('names the field of a request for revisions that asks for nothing', async () => {
    const decideUpdate = vi.fn();

    const response = await request(createTestApp({ decideUpdate }))
      .post(PATH)
      .set('Cookie', await adminCookie())
      .send({ ...revisions, flags: [] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'validation_failed',
      fieldErrors: { flags: 'Select what needs to be revised or clarified' },
    });
    expect(decideUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['no body', undefined],
    ['no decision', { submissionNumber: 2 }],
    ['a decision that is not one', { submissionNumber: 2, decision: 'publish' }],
    ['revisions without their flags', { submissionNumber: 2, decision: 'request_revisions' }],
    [
      'a task flagged twice',
      { ...revisions, flags: [...revisions.flags, { task: 'update-summary', notes: 'Again' }] },
    ],
  ])('refuses %s as invalid without asking the repository', async (_, sent) => {
    const decideUpdate = vi.fn();

    const response = await request(createTestApp({ decideUpdate }))
      .post(PATH)
      .set('Cookie', await adminCookie())
      .send(sent);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request' });
    expect(decideUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['no_draft', 404],
    ['not_allowed', 409],
    ['changed', 409],
  ] as const)('answers the refusal %s with %i', async (reason, status) => {
    const decideUpdate = vi.fn().mockResolvedValue({ ok: false, reason });

    const response = await request(createTestApp({ decideUpdate }))
      .post(PATH)
      .set('Cookie', await adminCookie())
      .send({ submissionNumber: 2, decision: 'imrg_review' });

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: reason });
  });
});
