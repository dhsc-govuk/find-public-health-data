import { request } from '@fphd/express/testing';
import type { Logger } from '@fphd/logger';
import { createCapturingLogger } from '@fphd/logger/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { indicatorSubmissionsRouter } from './indicator-submissions.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  type FakeInternalRepositoryOverrides,
  handlerLogLines,
  inTestTeam,
  TEST_USER_ID,
  testActor,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TEAM_ID = '00000000-0000-7000-8000-00000000000b';
const DRAFT_UPDATED_AT = '2026-10-22T09:30:00.123Z';

function createTestApp(
  overrides: FakeInternalRepositoryOverrides['indicators'] = {},
  logger?: Logger,
): Express {
  const repositories = createFakeInternalRepositories({
    indicators: { ...inTestTeam, ...overrides },
  });

  return createRouterTestApp(
    indicatorSubmissionsRouter(repositories.indicators, testSessionVerifier),
    logger,
  );
}

function publisherCookie(roles: readonly string[] = ['internal', 'publisher']) {
  return testSessionCookie(roles);
}

describe.each([
  ['submit', { draftUpdatedAt: DRAFT_UPDATED_AT }],
  ['withdraw', { submissionNumber: 1 }],
] as const)('POST /api/internal/indicators/:id/%s', (step, body) => {
  const path = `/api/internal/indicators/${ID}/${step}`;
  const method = step === 'submit' ? 'submit' : 'withdraw';

  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp()).post(path).send(body);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication_required' });
  });

  it('rejects a signed-in non-publisher', async () => {
    const response = await request(createTestApp())
      .post(path)
      .set('Cookie', await publisherCookie(['internal', 'admin']))
      .send(body);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
  });

  it("refuses a publisher another team's indicator", async () => {
    const takeStep = vi.fn();

    const response = await request(
      createTestApp({ findTeamId: async () => OTHER_TEAM_ID, [method]: takeStep }),
    )
      .post(path)
      .set('Cookie', await publisherCookie())
      .send(body);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
    expect(takeStep).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a UUID without asking the repository', async () => {
    const response = await request(createTestApp())
      .post(`/api/internal/indicators/108/${step}`)
      .set('Cookie', await publisherCookie())
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it('answers 404 for an indicator that does not exist', async () => {
    const response = await request(createTestApp({ findTeamId: async () => undefined }))
      .post(path)
      .set('Cookie', await publisherCookie())
      .send(body);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('answers 404 for an indicator with no draft', async () => {
    const takeStep = vi.fn().mockResolvedValue({ ok: false, reason: 'no_draft' });

    const response = await request(createTestApp({ [method]: takeStep }))
      .post(path)
      .set('Cookie', await publisherCookie())
      .send(body);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });

  it('answers 409 when the workflow does not allow the step now', async () => {
    const takeStep = vi.fn().mockResolvedValue({ ok: false, reason: 'not_allowed' });

    const response = await request(createTestApp({ [method]: takeStep }))
      .post(path)
      .set('Cookie', await publisherCookie())
      .send(body);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'not_allowed' });
  });

  it('takes the step as the signed-in publisher, answering 204, and logs it', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');
    const takeStep = vi.fn().mockResolvedValue({ ok: true });

    const response = await request(createTestApp({ [method]: takeStep }, logger))
      .post(path)
      .set('Cookie', await publisherCookie())
      .send(body);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(takeStep.mock.calls[0]?.at(0)).toBe(ID);
    expect(takeStep.mock.calls[0]?.at(-1)).toEqual(testActor(response));
    expect(await handlerLogLines(lines)).toEqual([
      expect.objectContaining({
        level: 30,
        msg: step === 'submit' ? 'Indicator submitted' : 'Indicator submission withdrawn',
        req: expect.objectContaining({ id: response.headers['x-fphd-request-id'] }),
        indicatorId: ID,
      }),
    ]);
    expect(JSON.stringify(lines)).not.toContain(TEST_USER_ID);
  });
});

describe('POST /api/internal/indicators/:id/submit', () => {
  const path = `/api/internal/indicators/${ID}/submit`;

  it('submits the draft as it was shown, by its last edit', async () => {
    const submit = vi.fn().mockResolvedValue({ ok: true });

    const response = await request(createTestApp({ submit }))
      .post(path)
      .set('Cookie', await publisherCookie())
      .send({ draftUpdatedAt: DRAFT_UPDATED_AT });

    expect(response.status).toBe(204);
    expect(submit).toHaveBeenCalledWith(ID, new Date(DRAFT_UPDATED_AT), testActor(response));
  });

  it.each([
    ['a missing last edit', {}],
    ['a last edit with no time', { draftUpdatedAt: '2026-10-22' }],
  ])('refuses %s without asking the repository', async (_, body) => {
    const submit = vi.fn();

    const response = await request(createTestApp({ submit }))
      .post(path)
      .set('Cookie', await publisherCookie())
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_draft_updated_at' });
    expect(submit).not.toHaveBeenCalled();
  });

  it.each(['changed', 'incomplete'])('answers 409 %s when the draft refuses', async (reason) => {
    const submit = vi.fn().mockResolvedValue({ ok: false, reason });

    const response = await request(createTestApp({ submit }))
      .post(path)
      .set('Cookie', await publisherCookie())
      .send({ draftUpdatedAt: DRAFT_UPDATED_AT });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: reason });
  });
});

describe('POST /api/internal/indicators/:id/withdraw', () => {
  const path = `/api/internal/indicators/${ID}/withdraw`;

  it('withdraws the submission the publisher was shown, by its number', async () => {
    const withdraw = vi.fn().mockResolvedValue({ ok: true });

    const response = await request(createTestApp({ withdraw }))
      .post(path)
      .set('Cookie', await publisherCookie())
      .send({ submissionNumber: 2 });

    expect(response.status).toBe(204);
    expect(withdraw).toHaveBeenCalledWith(ID, 2, testActor(response));
  });

  it.each([
    ['a missing number', {}],
    ['a number as text', { submissionNumber: '2' }],
    ['a number below 1', { submissionNumber: 0 }],
  ])('refuses %s without asking the repository', async (_, body) => {
    const withdraw = vi.fn();

    const response = await request(createTestApp({ withdraw }))
      .post(path)
      .set('Cookie', await publisherCookie())
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_submission_number' });
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('answers 409 changed when a newer submission has replaced the one shown', async () => {
    const withdraw = vi.fn().mockResolvedValue({ ok: false, reason: 'changed' });

    const response = await request(createTestApp({ withdraw }))
      .post(path)
      .set('Cookie', await publisherCookie())
      .send({ submissionNumber: 1 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'changed' });
  });
});

describe('POST /api/internal/indicators/:id/assign-reviewers', () => {
  const path = `/api/internal/indicators/${ID}/assign-reviewers`;
  const REVIEWER = '00000000-0000-7000-8000-0000000000a1';
  const OTHER_REVIEWER = '00000000-0000-7000-8000-0000000000a2';
  const body = { submissionNumber: 1, previousReviewerIds: [], reviewerIds: [REVIEWER] };

  function managerCookie() {
    return testSessionCookie(['internal', 'imrg-manager'], []);
  }

  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp()).post(path).send(body);

    expect(response.status).toBe(401);
  });

  it.each([
    ['a publisher in its team', ['internal', 'publisher']],
    ['an admin', ['internal', 'admin']],
    ['a reviewer', ['internal', 'imrg-reviewer']],
  ])('refuses %s', async (_, roles) => {
    const assignReviewers = vi.fn();

    const response = await request(createTestApp({ assignReviewers }))
      .post(path)
      .set('Cookie', await testSessionCookie(roles))
      .send(body);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
    expect(assignReviewers).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a UUID', async () => {
    const response = await request(createTestApp())
      .post('/api/internal/indicators/108/assign-reviewers')
      .set('Cookie', await managerCookie())
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it('answers 404 for an indicator that does not exist', async () => {
    const response = await request(createTestApp({ findTeamId: async () => undefined }))
      .post(path)
      .set('Cookie', await managerCookie())
      .send(body);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('assigns the reviewers as the signed-in manager, answering 204, and logs it', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');
    const assignReviewers = vi.fn().mockResolvedValue({ ok: true });
    const change = {
      submissionNumber: 2,
      previousReviewerIds: [REVIEWER],
      reviewerIds: [OTHER_REVIEWER, REVIEWER],
    };

    const response = await request(createTestApp({ assignReviewers }, logger))
      .post(path)
      .set('Cookie', await managerCookie())
      .send(change);

    expect(response.status).toBe(204);
    expect(assignReviewers).toHaveBeenCalledWith(ID, change, testActor(response));
    expect(await handlerLogLines(lines)).toEqual([
      expect.objectContaining({ level: 30, msg: 'Reviewers assigned', indicatorId: ID }),
    ]);
  });

  it.each([
    ['no reviewers', { ...body, reviewerIds: [] }, 'no_reviewers'],
    ['a reviewer twice', { ...body, reviewerIds: [REVIEWER, REVIEWER] }, 'duplicate_reviewers'],
    ['a reviewer id that is not one', { ...body, reviewerIds: ['jamie'] }, 'invalid_request'],
    ['no submission number', { ...body, submissionNumber: undefined }, 'invalid_request'],
    ['no reviewers shown', { ...body, previousReviewerIds: undefined }, 'invalid_request'],
  ])('refuses %s without asking the repository', async (_, sent, error) => {
    const assignReviewers = vi.fn();

    const response = await request(createTestApp({ assignReviewers }))
      .post(path)
      .set('Cookie', await managerCookie())
      .send(sent);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
    expect(assignReviewers).not.toHaveBeenCalled();
  });

  it('answers 404 for an indicator with no draft', async () => {
    const assignReviewers = vi.fn().mockResolvedValue({ ok: false, reason: 'no_draft' });

    const response = await request(createTestApp({ assignReviewers }))
      .post(path)
      .set('Cookie', await managerCookie())
      .send(body);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });

  it.each(['not_allowed', 'changed', 'not_a_reviewer'])(
    'answers 409 %s when the repository refuses',
    async (reason) => {
      const assignReviewers = vi.fn().mockResolvedValue({ ok: false, reason });

      const response = await request(createTestApp({ assignReviewers }))
        .post(path)
        .set('Cookie', await managerCookie())
        .send(body);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: reason });
    },
  );
});
