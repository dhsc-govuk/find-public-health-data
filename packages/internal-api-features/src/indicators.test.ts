import { request } from '@fphd/express/testing';
import type { Logger } from '@fphd/logger';
import { createCapturingLogger } from '@fphd/logger/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { editVersion } from './edit-version.ts';
import type { IndicatorAdminDetailRow, IndicatorAdminRow } from './indicator-list-repository.ts';
import { INDICATORS_PAGE_SIZE, internalIndicatorsRouter } from './indicators.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  type FakeInternalRepositoryOverrides,
  handlerLogLines,
  inTestTeam,
  TEST_TEAM_ID,
  TEST_USER_ID,
  testActor,
  testSessionCookie,
  testSessionVerifier,
  unansweredDraft,
} from './testing.ts';

const TEAM_ID = TEST_TEAM_ID;
const OTHER_TEAM_ID = '00000000-0000-7000-8000-00000000000b';

const row: IndicatorAdminRow = {
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Life expectancy at birth',
  teamId: TEAM_ID,
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  indicatorStatus: 'live',
  draftStatus: null,
  draftLocked: false,
  draftSubmissionStatus: null,
  draftReviewers: [],
};

const nameVersion = editVersion({ name: 'Life expectancy at birth' });

const detailRow: IndicatorAdminDetailRow = {
  ...row,
  shortId: 90366,
  publishedSlug: 'life-expectancy-at-birth',
  draftSubmissionNumber: null,
};

// Inside `createApiApp`, whose request logging gives the handlers their `request.log`.
function createTestApp(
  overrides: FakeInternalRepositoryOverrides['indicators'] = {},
  logger?: Logger,
): Express {
  const repositories = createFakeInternalRepositories({
    indicators: { ...inTestTeam, ...overrides },
  });

  return createRouterTestApp(
    internalIndicatorsRouter(repositories.indicators, testSessionVerifier),
    logger,
  );
}

function publisherCookie(roles: readonly string[] = ['internal', 'publisher']) {
  return testSessionCookie(roles, [TEAM_ID]);
}

describe('GET /api/internal/indicators', () => {
  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp()).get('/api/internal/indicators');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication_required' });
  });

  it('rejects a signed-in user who holds none of the four internal roles', async () => {
    const response = await request(createTestApp())
      .get('/api/internal/indicators')
      .set('Cookie', await publisherCookie(['internal']));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
  });

  it('serves the first page by default, with ISO timestamps and the page size used', async () => {
    const listRow = { ...row, teamName: 'Team A', createdBy: 'Alex Morgan', lastEditedBy: null };
    const listPage = vi.fn().mockResolvedValue({ indicators: [listRow], total: 23 });

    const response = await request(createTestApp({ listPage }))
      .get('/api/internal/indicators')
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(200);
    expect(listPage).toHaveBeenCalledWith(1, INDICATORS_PAGE_SIZE, {
      all: false,
      teamIds: [TEAM_ID],
    });
    expect(response.body).toEqual({
      indicators: [
        {
          id: row.id,
          name: 'Life expectancy at birth',
          teamId: TEAM_ID,
          teamName: 'Team A',
          createdBy: 'Alex Morgan',
          updatedAt: '2026-01-02T00:00:00.000Z',
          lastEditedBy: null,
          indicatorStatus: 'live',
          draftStatus: null,
          draftLocked: false,
          draftSubmissionStatus: null,
          draftReviewers: [],
        },
      ],
      page: 1,
      pageSize: INDICATORS_PAGE_SIZE,
      total: 23,
    });
  });

  it('serves the page asked for', async () => {
    const listPage = vi.fn().mockResolvedValue({ indicators: [], total: 23 });

    const response = await request(createTestApp({ listPage }))
      .get('/api/internal/indicators?page=3')
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(200);
    expect(listPage).toHaveBeenCalledWith(3, INDICATORS_PAGE_SIZE, expect.anything());
    expect(response.body).toMatchObject({ indicators: [], page: 3, total: 23 });
  });

  it.each([
    ['an admin', ['internal', 'admin'], { all: true }],
    ['an IMRG manager', ['internal', 'imrg-manager'], { all: true }],
    ['an IMRG reviewer', ['internal', 'imrg-reviewer'], { all: false, teamIds: [] }],
  ])('lists for %s the indicators their roles let them see', async (_who, roles, scope) => {
    const listPage = vi.fn().mockResolvedValue({ indicators: [], total: 0 });

    const response = await request(createTestApp({ listPage }))
      .get('/api/internal/indicators')
      .set('Cookie', await testSessionCookie(roles, [TEAM_ID]));

    expect(response.status).toBe(200);
    expect(listPage).toHaveBeenCalledWith(1, INDICATORS_PAGE_SIZE, scope);
  });

  it("lists only a publisher's own teams when asked, though they manage IMRG", async () => {
    const listPage = vi.fn().mockResolvedValue({ indicators: [], total: 0 });

    const response = await request(createTestApp({ listPage }))
      .get('/api/internal/indicators?teams=own')
      .set('Cookie', await testSessionCookie(['internal', 'publisher', 'imrg-manager'], [TEAM_ID]));

    expect(response.status).toBe(200);
    expect(listPage).toHaveBeenCalledWith(1, INDICATORS_PAGE_SIZE, {
      all: false,
      teamIds: [TEAM_ID],
    });
  });

  it('rejects a teams filter other than own as a bad request', async () => {
    const response = await request(createTestApp())
      .get('/api/internal/indicators?teams=all')
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_teams' });
  });

  it.each(['0', '-1', '1.5', 'two', '1&page=2'])(
    'rejects a page of %s as a bad request',
    async (page) => {
      const response = await request(createTestApp())
        .get(`/api/internal/indicators?page=${page}`)
        .set('Cookie', await publisherCookie());

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'invalid_page' });
    },
  );
});

describe('GET /api/internal/indicators/:id', () => {
  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp()).get(`/api/internal/indicators/${row.id}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication_required' });
  });

  it('rejects a signed-in user who holds none of the four internal roles', async () => {
    const response = await request(createTestApp())
      .get(`/api/internal/indicators/${row.id}`)
      .set('Cookie', await publisherCookie(['internal']));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
  });

  it('serves the indicator with its public identifiers and derived statuses', async () => {
    const findById = vi.fn().mockResolvedValue(detailRow);

    const response = await request(createTestApp({ findById }))
      .get(`/api/internal/indicators/${row.id}`)
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(200);
    expect(findById).toHaveBeenCalledWith(row.id);
    expect(response.body).toEqual({
      id: row.id,
      shortId: 90366,
      name: 'Life expectancy at birth',
      teamId: TEAM_ID,
      publishedSlug: 'life-expectancy-at-birth',
      updatedAt: '2026-01-02T00:00:00.000Z',
      indicatorStatus: 'live',
      draftStatus: null,
      draftLocked: false,
      draftSubmissionStatus: null,
      draftReviewers: [],
      draftSubmissionNumber: null,
      nameVersion,
      actions: [],
    });
  });

  it("serves the reviewers of the draft's latest submission", async () => {
    const draftReviewers = [{ id: '00000000-0000-7000-8000-0000000000a1', name: 'Jamie Evans' }];
    const findById = vi.fn().mockResolvedValue({
      ...detailRow,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftLocked: true,
      draftSubmissionStatus: 'in_review',
      draftReviewers,
    });

    const response = await request(createTestApp({ findById }))
      .get(`/api/internal/indicators/${row.id}`)
      .set('Cookie', await publisherCookie());

    expect(response.body).toMatchObject({ draftReviewers });
  });

  it('offers an IMRG manager the assignment of reviewers to a submitted draft', async () => {
    const findById = vi.fn().mockResolvedValue({
      ...detailRow,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftLocked: true,
      draftSubmissionStatus: 'submitted',
    });

    const response = await request(createTestApp({ findById }))
      .get(`/api/internal/indicators/${row.id}`)
      .set('Cookie', await testSessionCookie(['internal', 'imrg-manager'], []));

    expect(response.status).toBe(200);
    expect(response.body.actions).toEqual(['assign_reviewers']);
  });

  it('serves whether the draft is locked and where its latest submission stands', async () => {
    const findById = vi.fn().mockResolvedValue({
      ...detailRow,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftLocked: true,
      draftSubmissionStatus: 'submitted',
    });

    const response = await request(createTestApp({ findById }))
      .get(`/api/internal/indicators/${row.id}`)
      .set('Cookie', await publisherCookie());

    expect(response.body).toMatchObject({ draftLocked: true, draftSubmissionStatus: 'submitted' });
  });

  it("offers the steps a publisher in the indicator's team may take now", async () => {
    const findById = vi.fn().mockResolvedValue({
      ...detailRow,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftLocked: true,
      draftSubmissionStatus: 'submitted',
    });

    const response = await request(createTestApp({ findById }))
      .get(`/api/internal/indicators/${row.id}`)
      .set('Cookie', await publisherCookie());

    expect(response.body.actions).toEqual(['withdraw']);
  });

  it('offers no step to a user who may see the indicator but not edit it', async () => {
    const findById = vi.fn().mockResolvedValue({
      ...detailRow,
      indicatorStatus: 'new',
      draftStatus: 'draft',
    });

    const response = await request(createTestApp({ findById }))
      .get(`/api/internal/indicators/${row.id}`)
      .set('Cookie', await testSessionCookie(['internal', 'admin']));

    expect(response.status).toBe(200);
    expect(response.body.actions).toEqual([]);
  });

  it("answers 404 for another team's indicator, as for one that does not exist", async () => {
    const findById = vi.fn().mockResolvedValue({ ...detailRow, teamId: OTHER_TEAM_ID });

    const response = await request(createTestApp({ findById }))
      .get(`/api/internal/indicators/${row.id}`)
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it.each([
    ['an admin', ['internal', 'admin']],
    ['an IMRG manager', ['internal', 'imrg-manager']],
  ])("serves %s any team's indicator", async (_who, roles) => {
    const findById = vi.fn().mockResolvedValue({ ...detailRow, teamId: OTHER_TEAM_ID });

    const response = await request(createTestApp({ findById }))
      .get(`/api/internal/indicators/${row.id}`)
      .set('Cookie', await testSessionCookie(roles));

    expect(response.status).toBe(200);
  });

  it('answers 404 for an indicator that does not exist', async () => {
    const findById = vi.fn().mockResolvedValue(undefined);

    const response = await request(createTestApp({ findById }))
      .get('/api/internal/indicators/00000000-0000-7000-8000-000000000000')
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('rejects an id that is not a UUID without asking the repository', async () => {
    const findById = vi.fn();

    const response = await request(createTestApp({ findById }))
      .get('/api/internal/indicators/108')
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
    expect(findById).not.toHaveBeenCalled();
  });
});

describe('POST /api/internal/indicators', () => {
  const created = { ok: true, indicatorId: row.id, shortId: 90366, versionId: 'version-1' };
  const draftRow: IndicatorAdminDetailRow = {
    ...row,
    shortId: 90366,
    publishedSlug: null,
    indicatorStatus: 'new',
    draftStatus: 'draft',
    draftSubmissionNumber: null,
  };

  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp())
      .post('/api/internal/indicators')
      .send({ name: 'A new indicator', teamId: TEAM_ID });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication_required' });
  });

  it('rejects a signed-in non-publisher', async () => {
    const response = await request(createTestApp())
      .post('/api/internal/indicators')
      .set('Cookie', await publisherCookie(['internal']))
      .send({ name: 'A new indicator', teamId: TEAM_ID });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
  });

  it('refuses a publisher in no team, who has nowhere to put an indicator', async () => {
    const createDraft = vi.fn();

    const response = await request(createTestApp({ createDraft }))
      .post('/api/internal/indicators')
      .set('Cookie', await testSessionCookie(['internal', 'publisher'], []))
      .send({ name: 'A new indicator', teamId: TEAM_ID });

    expect(response.status).toBe(403);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['names no team', { name: 'A new indicator' }],
    ['names a team that is not a UUID', { name: 'A new indicator', teamId: 'team-a' }],
  ])('rejects a creation that %s, without creating anything', async (_case, body) => {
    const createDraft = vi.fn();

    const response = await request(createTestApp({ createDraft }))
      .post('/api/internal/indicators')
      .set('Cookie', await publisherCookie())
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_team' });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('refuses a creation in a team the publisher is not in, without creating anything', async () => {
    const createDraft = vi.fn();

    const response = await request(createTestApp({ createDraft }))
      .post('/api/internal/indicators')
      .set('Cookie', await publisherCookie())
      .send({ name: 'A new indicator', teamId: OTHER_TEAM_ID });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('puts the draft in the team the publisher chose of theirs', async () => {
    const createDraft = vi.fn().mockResolvedValue(created);

    const response = await request(createTestApp({ createDraft, findById: async () => draftRow }))
      .post('/api/internal/indicators')
      .set('Cookie', await testSessionCookie(['internal', 'publisher'], [TEAM_ID, OTHER_TEAM_ID]))
      .send({ name: 'Life expectancy at birth', teamId: OTHER_TEAM_ID });

    expect(response.status).toBe(201);
    expect(createDraft).toHaveBeenCalledWith(
      { name: 'Life expectancy at birth' },
      testActor(response),
      OTHER_TEAM_ID,
    );
  });

  it('creates a draft for the signed-in publisher and serves it back', async () => {
    const createDraft = vi.fn().mockResolvedValue(created);
    const findById = vi.fn().mockResolvedValue(draftRow);

    const response = await request(createTestApp({ createDraft, findById }))
      .post('/api/internal/indicators')
      .set('Cookie', await publisherCookie())
      .send({ name: 'Life expectancy at birth', teamId: TEAM_ID });

    expect(response.status).toBe(201);
    expect(createDraft).toHaveBeenCalledWith(
      { name: 'Life expectancy at birth' },
      testActor(response),
      TEAM_ID,
    );
    expect(response.body).toEqual({
      id: row.id,
      shortId: 90366,
      name: 'Life expectancy at birth',
      teamId: TEAM_ID,
      publishedSlug: null,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftLocked: false,
      draftSubmissionStatus: null,
      draftReviewers: [],
      updatedAt: '2026-01-02T00:00:00.000Z',
      draftSubmissionNumber: null,
      nameVersion,
      actions: ['submit'],
    });
  });

  it('stores the name without its surrounding spaces', async () => {
    const createDraft = vi.fn().mockResolvedValue(created);

    const response = await request(createTestApp({ createDraft, findById: async () => draftRow }))
      .post('/api/internal/indicators')
      .set('Cookie', await publisherCookie())
      .send({ name: '  Life expectancy at birth  ', teamId: TEAM_ID });

    expect(createDraft).toHaveBeenCalledWith(
      { name: 'Life expectancy at birth' },
      testActor(response),
      TEAM_ID,
    );
  });

  it('reports a name another indicator already holds against the field', async () => {
    const createDraft = vi.fn().mockResolvedValue({ ok: false, reason: 'slug_taken' });
    const findById = vi.fn();

    const response = await request(createTestApp({ createDraft, findById }))
      .post('/api/internal/indicators')
      .set('Cookie', await publisherCookie())
      .send({ name: 'Life expectancy at birth', teamId: TEAM_ID });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'slug_taken',
      fieldErrors: { name: 'An indicator with this name already exists' },
    });
    expect(findById).not.toHaveBeenCalled();
  });

  it('refuses a name the rules refuse, naming the field, without creating anything', async () => {
    const createDraft = vi.fn();

    const response = await request(createTestApp({ createDraft }))
      .post('/api/internal/indicators')
      .set('Cookie', await publisherCookie())
      .send({ name: '', teamId: TEAM_ID });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'validation_failed',
      fieldErrors: { name: 'Enter the name of the indicator' },
    });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('logs the creation under the request id, by the ids alone', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');
    const createDraft = vi.fn().mockResolvedValue(created);

    const response = await request(
      createTestApp({ createDraft, findById: async () => draftRow }, logger),
    )
      .post('/api/internal/indicators')
      .set('Cookie', await publisherCookie())
      .send({ name: 'Life expectancy at birth', teamId: TEAM_ID });

    expect(await handlerLogLines(lines)).toEqual([
      expect.objectContaining({
        level: 30,
        msg: 'Indicator created',
        req: expect.objectContaining({ id: response.headers['x-fphd-request-id'] }),
        indicatorId: row.id,
        shortId: 90366,
      }),
    ]);
    expect(JSON.stringify(lines)).not.toContain('Life expectancy');
    expect(JSON.stringify(lines)).not.toContain(TEST_USER_ID);
  });

  it('logs nothing when the name is taken', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');

    await request(
      createTestApp({ createDraft: async () => ({ ok: false, reason: 'slug_taken' }) }, logger),
    )
      .post('/api/internal/indicators')
      .set('Cookie', await publisherCookie())
      .send({ name: 'Life expectancy at birth', teamId: TEAM_ID });

    expect(await handlerLogLines(lines)).toEqual([]);
  });
});

describe('PATCH /api/internal/indicators/:id', () => {
  const draftRow: IndicatorAdminDetailRow = {
    ...row,
    shortId: 90366,
    publishedSlug: null,
    indicatorStatus: 'new',
    draftStatus: 'draft',
    draftSubmissionNumber: null,
  };
  const path = `/api/internal/indicators/${row.id}`;

  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp())
      .patch(path)
      .send({ name: 'A better name', version: nameVersion });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication_required' });
  });

  it('rejects a signed-in non-publisher', async () => {
    const response = await request(createTestApp())
      .patch(path)
      .set('Cookie', await publisherCookie(['internal']))
      .send({ name: 'A better name', version: nameVersion });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
  });

  it('renames the draft as the signed-in publisher and serves the indicator back', async () => {
    const updateDraft = vi.fn().mockResolvedValue({ ok: true });
    const findById = vi.fn().mockResolvedValue({ ...draftRow, name: 'A better name' });

    const response = await request(createTestApp({ updateDraft, findById }))
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send({ name: '  A better name  ', version: nameVersion });

    expect(response.status).toBe(200);
    expect(updateDraft).toHaveBeenCalledWith(
      row.id,
      { name: 'A better name' },
      {},
      testActor(response),
      { version: nameVersion, versionOf: expect.any(Function) },
    );
    expect(response.body).toEqual({
      id: row.id,
      shortId: 90366,
      name: 'A better name',
      teamId: TEAM_ID,
      publishedSlug: null,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftLocked: false,
      draftSubmissionStatus: null,
      draftReviewers: [],
      updatedAt: '2026-01-02T00:00:00.000Z',
      draftSubmissionNumber: null,
      nameVersion: editVersion({ name: 'A better name' }),
      actions: ['submit'],
    });
  });

  it("takes the version from the draft's name alone", async () => {
    const updateDraft = vi.fn().mockResolvedValue({ ok: true });

    await request(createTestApp({ updateDraft, findById: async () => draftRow }))
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send({ name: 'A better name', version: nameVersion });

    const versionOf = updateDraft.mock.lastCall?.[4].versionOf;
    expect(versionOf({ ...unansweredDraft, name: 'Life expectancy at birth' })).toBe(nameVersion);
    expect(
      versionOf({ ...unansweredDraft, name: 'Life expectancy at birth', definition: 'Edited' }),
    ).toBe(nameVersion);
  });

  it('answers changed, with the version now, for a name changed since the page showed it', async () => {
    const findById = vi.fn();
    const version = editVersion({ name: 'Renamed since' });

    const response = await request(
      createTestApp({
        updateDraft: async () => ({ ok: false, reason: 'changed', version }),
        findById,
      }),
    )
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send({ name: 'A better name', version: nameVersion });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'changed', version });
    expect(findById).not.toHaveBeenCalled();
  });

  it.each([
    ['no version', { name: 'A better name' }],
    ['a version the API did not make', { name: 'A better name', version: 'stale' }],
  ])('refuses a rename with %s without renaming', async (_, body) => {
    const updateDraft = vi.fn();

    const response = await request(createTestApp({ updateDraft }))
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_version' });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a UUID without touching the repository', async () => {
    const updateDraft = vi.fn();

    const response = await request(createTestApp({ updateDraft }))
      .patch('/api/internal/indicators/108')
      .set('Cookie', await publisherCookie())
      .send({ name: 'A better name', version: nameVersion });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('refuses a name the rules refuse, naming the field, without renaming', async () => {
    const updateDraft = vi.fn();

    const response = await request(createTestApp({ updateDraft, findById: async () => draftRow }))
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send({ name: '  ', version: nameVersion });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'validation_failed',
      fieldErrors: { name: 'Enter the name of the indicator' },
    });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['no indicator', undefined],
    ['no draft', detailRow],
  ])('names the refused name for %s', async (_, found) => {
    const response = await request(createTestApp({ findById: async () => found }))
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send({ name: '  ', version: nameVersion });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'validation_failed' });
  });

  it('answers 409 rather than the refused name for a draft locked for review', async () => {
    const updateDraft = vi.fn();
    const findById = async () => ({ ...draftRow, draftLocked: true });

    const response = await request(createTestApp({ updateDraft, findById }))
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send({ name: '  ', version: nameVersion });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('answers not_found when there is no indicator to rename', async () => {
    const response = await request(
      createTestApp({
        updateDraft: async () => ({ ok: false, reason: 'no_draft' }),
        findById: async () => undefined,
      }),
    )
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send({ name: 'A better name', version: nameVersion });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('reports a name another indicator already holds against the field, reading nothing back', async () => {
    const findById = vi.fn();

    const response = await request(
      createTestApp({
        updateDraft: async () => ({ ok: false, reason: 'slug_taken' }),
        findById,
      }),
    )
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send({ name: 'Life expectancy at birth', version: nameVersion });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'slug_taken',
      fieldErrors: { name: 'An indicator with this name already exists' },
    });
    expect(findById).not.toHaveBeenCalled();
  });

  it('answers 404 for an indicator with no draft to rename', async () => {
    const response = await request(
      createTestApp({
        updateDraft: async () => ({ ok: false, reason: 'no_draft' }),
        findById: async () => detailRow,
      }),
    )
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send({ name: 'A better name', version: nameVersion });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });

  it('answers 409 for a draft locked for review', async () => {
    const response = await request(
      createTestApp({ updateDraft: async () => ({ ok: false, reason: 'locked' }) }),
    )
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send({ name: 'A better name', version: nameVersion });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
  });

  it('logs the rename under the request id, by the ids alone', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');

    const response = await request(
      createTestApp(
        { updateDraft: async () => ({ ok: true }), findById: async () => draftRow },
        logger,
      ),
    )
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send({ name: 'A better name', version: nameVersion });

    expect(await handlerLogLines(lines)).toEqual([
      expect.objectContaining({
        level: 30,
        msg: 'Indicator renamed',
        req: expect.objectContaining({ id: response.headers['x-fphd-request-id'] }),
        indicatorId: row.id,
        shortId: 90366,
      }),
    ]);
    expect(JSON.stringify(lines)).not.toContain('A better name');
    expect(JSON.stringify(lines)).not.toContain(TEST_USER_ID);
  });

  it('logs nothing when the rename is refused', async () => {
    const { logger, lines } = createCapturingLogger('internal-api');

    await request(
      createTestApp(
        {
          updateDraft: async () => ({ ok: false, reason: 'slug_taken' }),
          findById: async () => draftRow,
        },
        logger,
      ),
    )
      .patch(path)
      .set('Cookie', await publisherCookie())
      .send({ name: 'Life expectancy at birth', version: nameVersion });

    expect(await handlerLogLines(lines)).toEqual([]);
  });
});

describe('GET /api/internal/indicators/:id/task-list', () => {
  const draftState = {
    id: row.id,
    shortId: 90366,
    teamId: TEAM_ID,
    draft: {
      ...unansweredDraft,
      name: 'Life expectancy at birth',
      updatedAt: new Date('2026-10-22T09:30:00.123Z'),
      isLocked: false,
    },
    draftCiMethodKind: null,
    indicatorStatus: 'new',
    draftStatus: 'draft',
    draftSubmissionStatus: null,
  };

  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp()).get(
      `/api/internal/indicators/${row.id}/task-list`,
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication_required' });
  });

  it('rejects a signed-in non-publisher', async () => {
    const response = await request(createTestApp())
      .get(`/api/internal/indicators/${row.id}/task-list`)
      .set('Cookie', await publisherCookie(['internal']));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
  });

  it('serves the draft as a task list', async () => {
    const findDraftState = vi.fn().mockResolvedValue(draftState);

    const response = await request(createTestApp({ findDraftState }))
      .get(`/api/internal/indicators/${row.id}/task-list`)
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(200);
    expect(findDraftState).toHaveBeenCalledWith(row.id);
    expect(response.body).toEqual({
      indicator: {
        id: row.id,
        shortId: 90366,
        name: 'Life expectancy at birth',
        indicatorStatus: 'new',
        draftStatus: 'draft',
        draftSubmissionStatus: null,
      },
      isUpdate: false,
      canSubmit: false,
      draftUpdatedAt: '2026-10-22T09:30:00.123Z',
      editable: true,
      actions: ['submit'],
      tasks: {
        name: 'completed',
        'data-table': 'not_started',
        'definition-and-rationale': 'not_started',
        polarity: 'not_started',
        'data-quality': 'not_started',
        numerator: 'not_started',
        denominator: 'not_started',
        calculation: 'not_started',
        'confidence-intervals': 'not_started',
        'update-frequency': 'not_started',
        'value-type-and-units': 'not_started',
        'period-type': 'not_started',
        'other-notes-and-caveats': 'not_started',
        'publishing-date': 'not_started',
        links: 'not_started',
        'variance-and-quality': 'not_started',
        justifications: 'not_started',
        'other-comments': 'not_started',
        'copyright-and-data-reuse': 'not_started',
        benchmarking: 'not_started',
        'sex-and-ages': 'not_started',
        tagging: 'not_started',
      },
    });
  });

  it("judges the confidence intervals by the kind of the draft's method", async () => {
    const findDraftState = vi.fn().mockResolvedValue({
      ...draftState,
      draft: { ...draftState.draft, ciMethodId: '019fa38f-0747-73bb-b8a4-bb6e8f3c244e' },
      draftCiMethodKind: 'none',
    });

    const response = await request(createTestApp({ findDraftState }))
      .get(`/api/internal/indicators/${row.id}/task-list`)
      .set('Cookie', await publisherCookie());

    expect(response.body.tasks['confidence-intervals']).toBe('completed');
  });

  it('reports a draft behind a published version as an update of a live indicator', async () => {
    const findDraftState = vi.fn().mockResolvedValue({ ...draftState, indicatorStatus: 'live' });

    const response = await request(createTestApp({ findDraftState }))
      .get(`/api/internal/indicators/${row.id}/task-list`)
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      indicator: { indicatorStatus: 'live', draftStatus: 'draft' },
      isUpdate: true,
    });
  });

  it('serves a draft locked for review as not editable, offering its withdrawal', async () => {
    const findDraftState = vi.fn().mockResolvedValue({
      ...draftState,
      draft: { ...draftState.draft, isLocked: true },
      draftSubmissionStatus: 'submitted',
    });

    const response = await request(createTestApp({ findDraftState }))
      .get(`/api/internal/indicators/${row.id}/task-list`)
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      indicator: { draftSubmissionStatus: 'submitted' },
      editable: false,
      actions: ['withdraw'],
    });
  });

  it('answers 404 for an indicator that does not exist', async () => {
    const findDraftState = vi.fn().mockResolvedValue(undefined);

    const response = await request(createTestApp({ findDraftState }))
      .get('/api/internal/indicators/00000000-0000-7000-8000-000000000000/task-list')
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('answers 404 for an indicator with no draft to edit', async () => {
    const findDraftState = vi.fn().mockResolvedValue({
      ...draftState,
      draft: null,
      indicatorStatus: 'live',
      draftStatus: null,
    });

    const response = await request(createTestApp({ findDraftState }))
      .get(`/api/internal/indicators/${row.id}/task-list`)
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });

  it('rejects an id that is not a UUID without asking the repository', async () => {
    const findDraftState = vi.fn();

    const response = await request(createTestApp({ findDraftState }))
      .get('/api/internal/indicators/108/task-list')
      .set('Cookie', await publisherCookie());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
    expect(findDraftState).not.toHaveBeenCalled();
  });
});
