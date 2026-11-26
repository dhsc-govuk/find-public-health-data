import { TEAM_IDS } from '@fphd/auth';
import { createJwtSessionService, createJwtSessionVerifier } from '@fphd/auth/jwt-session';
import { createFakeRepositories } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import {
  flaggableTaskKeySchema,
  indicatorTaskKeySchema,
} from '@fphd/internal-api-features/contract';
import {
  createFakeInternalRepositories,
  unansweredDraft,
} from '@fphd/internal-api-features/testing';
import { createFakeBlobStorage } from '@fphd/internal-storage/testing';
import { createLogger } from '@fphd/logger';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from './app.ts';

const session = createJwtSessionService({
  audience: 'fphd-internal',
  clock: () => new Date('2026-07-23T10:00:00.000Z'),
  cookieName: 'fphd-internal-session',
  issuer: 'fphd-auth',
  secret: 'a-jwt-session-secret-that-is-long-enough-for-tests',
  secure: false,
});
const verifier = createJwtSessionVerifier(session);
const logger = createLogger({ name: 'internal-api', level: 'silent' });

function createTestApp(
  repositories = createFakeRepositories(),
  internalRepositories = createFakeInternalRepositories(),
) {
  return createApp({
    logger,
    repositories,
    internalRepositories,
    session: verifier,
    storage: createFakeBlobStorage(),
  });
}

const app = createTestApp();

const stepRow = {
  id: '00000000-0000-7000-8000-000000000001',
  teamId: TEAM_IDS.teamA,
  draftReviewers: [],
};

async function createCookie(roles: readonly string[]): Promise<string> {
  const token = await session.issueToken({
    expiresInSeconds: 900,
    roles,
    subject: 'test-user',
    teams: [TEAM_IDS.teamA],
  });
  return session.createCookieHeader(token, 900);
}

describe('internal API', () => {
  it('mounts compact public rankings without requiring an internal session', async () => {
    const data = [{ areaCode: 'E06000052', areaName: 'Cornwall', observations: [] }];
    const findRankingData = vi.fn().mockResolvedValue(data);
    const repositories = createFakeRepositories({
      indicators: { resolveId: async () => 'published-id', findRankingData },
    });
    const response = await request(createTestApp(repositories)).get(
      '/api/indicators/108/ranking?areaCode=E06000052',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual(data);
    expect(findRankingData).toHaveBeenCalledWith('published-id', ['E06000052']);
  });
  it('mounts bulk public table data without requiring an internal session', async () => {
    const findTableData = vi.fn().mockResolvedValue([]);
    const response = await request(
      createTestApp(createFakeRepositories({ indicators: { findTableData } })),
    ).get('/api/indicator-data?indicator=108');
    expect(response.status).toBe(404);
    expect(findTableData).toHaveBeenCalledWith([108], ['E92000001']);
  });
  it('keeps the public surface open', async () => {
    const response = await request(app).get('/api');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ audience: 'public' });
  });

  it('requires authentication for its internal surface', async () => {
    const response = await request(app).get('/api/internal/indicators');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication_required' });
  });

  it('rejects a signed-in user who holds none of the internal roles', async () => {
    const response = await request(app)
      .get('/api/internal/indicators')
      .set('Cookie', await createCookie([]));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
  });

  it('rejects and clears an invalid session', async () => {
    const response = await request(app)
      .get('/api/internal/indicators')
      .set('Cookie', 'fphd-internal-session=not-a-jwt');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'invalid_session' });
    expect(response.get('Set-Cookie')?.[0]).toContain('Max-Age=0');
  });

  // The superset rule is structural — both apps mount publicApiRoutes — but assert it here
  // so a route added to the public surface alone would fail rather than silently 404.
  it('serves the public indicators surface', async () => {
    const repositories = createFakeRepositories({ indicators: { listPublished: async () => [] } });

    const response = await request(createTestApp(repositories)).get('/api/indicators');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ indicators: [] });
  });

  // Each section is found from the contract, so a new one is checked without an entry here.
  it('mounts the indicator list behind the internal roles', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: { listPage: async () => ({ indicators: [], total: 0 }) },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);

    const asReviewer = await request(app)
      .get('/api/internal/indicators')
      .set('Cookie', await createCookie(['imrg-reviewer']));
    const asPublic = await request(app)
      .get('/api/internal/indicators')
      .set('Cookie', await createCookie([]));

    expect(asReviewer.status).toBe(200);
    expect(asPublic.status).toBe(403);
  });

  it.each([
    '/api/internal/ci-methods',
    '/api/internal/tags',
    '/api/internal/data-providers',
    '/api/internal/value-types-and-units',
    '/api/internal/indicators/00000000-0000-7000-8000-000000000001/data-uploads/latest',
    ...indicatorTaskKeySchema.options
      .filter((key) => key !== 'name')
      .map((key) => `/api/internal/indicators/00000000-0000-7000-8000-000000000001/${key}`),
  ])('mounts %s behind the publisher role', async (path) => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: async () => ({ teamId: TEAM_IDS.teamA, draftReviewers: [] }),
        // The handlers read only the draft's section columns.
        findDraftState: vi.fn().mockResolvedValue({ draft: unansweredDraft }),
      },
      ciMethods: { list: async () => [] },
      tags: {
        listOptions: async () => ({
          topics: [],
          subtopics: [],
          indicatorTypes: [],
          frameworks: [],
          lifeStages: [],
          riskFactors: [],
        }),
      },
      dataProviders: { list: async () => [] },
      dataUploads: {
        findDraft: async () => ({ id: '00000000-0000-7000-8000-000000000002', isLocked: false }),
        findLatest: async () => undefined,
        findDraftDataTable: async () => ({ found: true, dataTable: null }),
      },
      valueTypesAndUnits: { listOptions: async () => ({ valueTypes: [], units: [] }) },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);

    const asPublisher = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['publisher']));
    const asAdmin = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['admin']));

    expect(asPublisher.status).toBe(200);
    expect(asAdmin.status).toBe(403);
  });

  it.each([
    ['submit', { draftUpdatedAt: '2026-10-22T09:30:00.123Z' }],
    ['withdraw', { submissionNumber: 1 }],
  ])('mounts the %s step behind the publisher role', async (step, body) => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: vi.fn().mockResolvedValue(stepRow),
        submit: async () => ({ ok: true }),
        withdraw: async () => ({ ok: true }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = `/api/internal/indicators/00000000-0000-7000-8000-000000000001/${step}`;

    const asPublisher = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['publisher']))
      .send(body);
    const asAdmin = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['admin']))
      .send(body);

    expect(asPublisher.status).toBe(204);
    expect(asAdmin.status).toBe(403);
  });

  it('mounts the discard of a draft behind the publisher role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: vi.fn().mockResolvedValue(stepRow),
        discardDraft: async () => ({ ok: true, indicatorDeleted: true, deletedBlobNames: [] }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/discard';
    const body = { draftUpdatedAt: '2026-10-22T09:30:00.123Z' };

    const asPublisher = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['publisher']))
      .send(body);
    const asAdmin = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['admin']))
      .send(body);

    expect(asPublisher.status).toBe(204);
    expect(asAdmin.status).toBe(403);
  });

  it('mounts the start of an update behind the publisher role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: vi.fn().mockResolvedValue(stepRow),
        draftFromPublished: async () => ({ ok: true, versionId: stepRow.id }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/draft';

    const asPublisher = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['publisher']));
    const asAdmin = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['admin']));

    expect(asPublisher.status).toBe(204);
    expect(asAdmin.status).toBe(403);
  });

  it('mounts the assign reviewers step behind the IMRG manager role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: vi.fn().mockResolvedValue(stepRow),
        assignReviewers: async () => ({ ok: true }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/assign-reviewers';
    const body = {
      submissionNumber: 1,
      previousReviewerIds: [],
      reviewerIds: ['00000000-0000-7000-8000-0000000000a1'],
    };

    const asManager = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['imrg-manager']))
      .send(body);
    const asPublisher = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['publisher']))
      .send(body);

    expect(asManager.status).toBe(204);
    expect(asPublisher.status).toBe(403);
  });

  it('mounts the publication date confirmation behind the admin role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: vi.fn().mockResolvedValue(stepRow),
        schedule: async () => ({ ok: true }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/schedule';
    const body = {
      publishingDateDay: '4',
      publishingDateMonth: '11',
      publishingDateYear: '2099',
      publishingTimeHour: '09',
      publishingTimeMinute: '30',
      shownScheduledPublishAt: '2099-10-04T08:30:00.000Z',
    };

    const asAdmin = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['admin']))
      .send(body);
    const asPublisher = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['publisher']))
      .send(body);

    expect(asAdmin.status).toBe(204);
    expect(asPublisher.status).toBe(403);
  });

  it("mounts the core team's update decision behind the admin role", async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: vi.fn().mockResolvedValue(stepRow),
        decideUpdate: async () => ({ ok: true }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/update-decision';
    const body = {
      submissionNumber: 1,
      decision: 'request_revisions',
      clarificationRequest: 'Why now?',
      flags: [],
    };

    const asAdmin = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['admin']))
      .send(body);
    const asPublisher = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['publisher']))
      .send(body);

    expect(asAdmin.status).toBe(204);
    expect(asPublisher.status).toBe(403);

    // Its own body limit, over the default 100 kB.
    const long = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['admin']))
      .send({
        ...body,
        flags: flaggableTaskKeySchema.options.map((task) => ({ task, notes: '€'.repeat(10_000) })),
      });
    expect(long.status).toBe(204);
  });

  it('mounts the review response behind the IMRG reviewer role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: vi.fn().mockResolvedValue({
          ...stepRow,
          draftReviewers: [{ id: 'test-user', name: 'A reviewer' }],
        }),
        respond: async () => ({ ok: true }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/review-response';
    const body = {
      submissionNumber: 1,
      kind: 'pre_imrg_feedback',
      imrgReviewedOn: null,
      clarificationRequest: 'What is counted?',
      flags: [],
    };

    const asReviewer = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['imrg-reviewer']))
      .send(body);
    const asPublisher = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['publisher']))
      .send(body);

    expect(asReviewer.status).toBe(204);
    expect(asPublisher.status).toBe(403);

    // Its own body limit, over the default 100 kB.
    const long = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['imrg-reviewer']))
      .send({
        ...body,
        flags: flaggableTaskKeySchema.options.map((task) => ({ task, notes: '€'.repeat(10_000) })),
      });
    expect(long.status).toBe(204);
  });

  it('mounts the reviewer options behind the IMRG manager role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: async () => ({
          id: '00000000-0000-7000-8000-000000000001',
          shortId: 90366,
          name: 'Life expectancy at birth',
          teamId: TEAM_IDS.teamA,
          publishedSlug: null,
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          indicatorStatus: 'new',
          draftStatus: 'draft',
          draftLocked: true,
          draftSubmissionStatus: 'submitted',
          draftResponseKind: null,
          draftSubmissionNumber: 1,
          draftReviewers: [],
          draftScheduledPublishAt: null,
          draftFirstSubmittedAt: null,
          draftResponse: null,
        }),
      },
      reviewers: { listOptions: async () => [] },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/reviewer-options';

    const asManager = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['imrg-manager']));
    const asPublisher = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['publisher']));

    expect(asManager.status).toBe(200);
    expect(asPublisher.status).toBe(403);
  });

  it('mounts the notes for reviewers', async () => {
    const id = '00000000-0000-7000-8000-000000000001';
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: async () => ({ teamId: TEAM_IDS.teamA, draftReviewers: [] }),
        findNotesForReviewers: async () => ({
          version: { ...unansweredDraft, id },
        }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = `/api/internal/indicators/${id}/notes-for-reviewers`;

    const asManager = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['imrg-manager']));

    expect(asManager.status).toBe(200);
  });

  it("mounts an indicator's history", async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: async () => ({ teamId: TEAM_IDS.teamA, draftReviewers: [] }),
        findHistory: async () => ({
          teamId: TEAM_IDS.teamA,
          draftReviewers: [],
          versions: [],
          submissions: [],
          assignments: [],
          scheduling: [],
          updates: [],
          saves: [],
        }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/history';

    const asManager = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['imrg-manager']));

    expect(asManager.status).toBe(200);
    expect(asManager.body).toEqual({ entries: [] });
  });

  it("mounts the reviewers' notes", async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: async () => ({
          teamId: TEAM_IDS.teamA,
          draftReviewers: [{ id: 'test-user', name: 'Test User' }],
        }),
      },
      reviewerNotes: { list: async () => [] },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/reviewer-notes';

    const asReviewer = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['imrg-reviewer']));

    expect(asReviewer.status).toBe(200);
    expect(asReviewer.body).toEqual({ notes: [] });
  });

  it("mounts the publisher's reply to a review behind the editor guard", async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: async () => ({ teamId: TEAM_IDS.teamA, draftReviewers: [] }),
        findRevisionRound: async () => ({
          hasDraft: true,
          draftLocked: false,
          submissionNumber: 1,
          submissionStatus: 'changes_requested',
          kind: 'minor_revisions',
          clarificationRequest: null,
          revisionResponse: null,
          flags: [
            {
              task: 'polarity',
              notes: 'Is higher better?',
              reviewerName: 'Sam Reviewer',
              cleared: false,
            },
          ],
        }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/revision-response';

    const asPublisher = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['publisher']));
    const asManager = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['imrg-manager']));

    expect(asPublisher.status).toBe(200);
    expect(asPublisher.body).toMatchObject({ kind: 'minor_revisions', flaggedTaskCount: 1 });
    expect(asManager.status).toBe(403);
  });

  it('mounts the indicators under review behind the IMRG manager role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: { listUnderReview: async () => ({ unassigned: [], assigned: [] }) },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators-under-review';

    const asManager = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['imrg-manager']));
    const asPublisher = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['publisher']));

    expect(asManager.status).toBe(200);
    expect(asPublisher.status).toBe(403);
  });

  it('mounts the indicators to review behind the IMRG reviewer role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: { listToReview: async () => [] },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators-to-review';

    const asReviewer = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['imrg-reviewer']));
    const asPublisher = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['publisher']));

    expect(asReviewer.status).toBe(200);
    expect(asPublisher.status).toBe(403);
  });

  it('mounts the scheduled indicators behind the admin role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: { listScheduled: async () => [] },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators-scheduled';

    const asAdmin = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['admin']));
    const asManager = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['imrg-manager']));

    expect(asAdmin.status).toBe(200);
    expect(asManager.status).toBe(403);
  });

  it('mounts the updates awaiting a decision behind the admin role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: { listAwaitingDecision: async () => [] },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/updates-awaiting-decision';

    const asAdmin = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['admin']));
    const asManager = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['imrg-manager']));

    expect(asAdmin.status).toBe(200);
    expect(asManager.status).toBe(403);
  });

  it('mounts the internal topics surface behind the admin role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      topics: {
        list: async () => [
          {
            id: '00000000-0000-7000-8000-000000000001',
            slug: 'topic-a',
            title: 'Topic A',
            description: 'All about topic A.',
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            updatedAt: new Date('2024-01-02T00:00:00.000Z'),
          },
        ],
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);

    const asAdmin = await request(app)
      .get('/api/internal/topics')
      .set('Cookie', await createCookie(['publisher', 'admin']));
    const asPublisher = await request(app)
      .get('/api/internal/topics')
      .set('Cookie', await createCookie(['publisher']));

    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body[0]).toMatchObject({ id: '00000000-0000-7000-8000-000000000001' });
    expect(asPublisher.status).toBe(403);
  });

  it('serves the public topics surface without a session', async () => {
    const repositories = createFakeRepositories({
      topics: {
        list: async () => [
          {
            id: '00000000-0000-7000-8000-000000000001',
            slug: 'topic-a',
            title: 'Topic A',
            description: 'All about topic A.',
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            updatedAt: new Date('2024-01-02T00:00:00.000Z'),
          },
        ],
      },
    });

    const response = await request(createTestApp(repositories)).get('/api/topics');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        slug: 'topic-a',
        title: 'Topic A',
        description: 'All about topic A.',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      },
    ]);
  });
});

describe('the indicator routes', () => {
  const id = '00000000-0000-7000-8000-000000000001';
  const preview = `/api/internal/indicators/${id}/preview`;
  const routes = [
    ['a section read', 'get', `/api/internal/indicators/${id}/polarity`],
    ['a section write', 'put', `/api/internal/indicators/${id}/polarity`],
    ['a rename', 'patch', `/api/internal/indicators/${id}`],
    ['a workflow step', 'post', `/api/internal/indicators/${id}/submit`],
    ['the task list', 'get', `/api/internal/indicators/${id}/task-list`],
    ['the start of an update', 'post', `/api/internal/indicators/${id}/draft`],
    ['a data upload', 'post', `/api/internal/indicators/${id}/data-uploads`],
    ['the data table check', 'get', `/api/internal/indicators/${id}/data-table`],
    ["the data table's values", 'get', `/api/internal/indicators/${id}/data-table/values`],
    ['the revision response', 'get', `/api/internal/indicators/${id}/revision-response`],
    ['the notes for reviewers', 'get', `/api/internal/indicators/${id}/notes-for-reviewers`],
    ['the history', 'get', `/api/internal/indicators/${id}/history`],
    ['the reviewer notes', 'get', `/api/internal/indicators/${id}/reviewer-notes`],
    ['a reviewer note', 'post', `/api/internal/indicators/${id}/reviewer-notes`],
    ['a withdrawal', 'post', `/api/internal/indicators/${id}/withdraw`],
    ['a discard', 'post', `/api/internal/indicators/${id}/discard`],
    ['the preview data', 'get', `${preview}/api/indicators/108/data`],
  ] as const;
  const detailRoutes = [
    ['the detail route', 'get', `/api/internal/indicators/${id}`],
    ['the preview detail', 'get', `${preview}/api/indicators/108`],
  ] as const;

  function createTeamBApp() {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findAccess: async () => ({ teamId: TEAM_IDS.teamB, draftReviewers: [] }),
      },
    });
    return createTestApp(createFakeRepositories(), internalRepositories);
  }

  it.each(routes)('answer a publisher in another team 404 on %s', async (_, method, path) => {
    const response = await request(createTeamBApp())
      [method](path)
      .set('Cookie', await createCookie(['publisher']));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it.each(routes.slice(0, 4))(
    'answer an admin, who may see the indicator but not edit it, 403 on %s',
    async (_, method, path) => {
      const response = await request(createTeamBApp())
        [method](path)
        .set('Cookie', await createCookie(['admin']));

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'forbidden' });
    },
  );

  it.each([...routes, ...detailRoutes])(
    'answer 400 for an id that is not one on %s',
    async (_, method, path) => {
      const response = await request(createTeamBApp())
        [method](path.replace(id, 'not-an-id'))
        .set('Cookie', await createCookie(['publisher']));

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'invalid_id' });
    },
  );
});

// One probe per kind of public router: the preview's own behaviour is tested in
// `@fphd/internal-api-features`, so these only pin that each is mounted again on its repositories.
describe('the indicator preview', () => {
  const id = '00000000-0000-7000-8000-000000000001';
  const prefix = `/api/internal/indicators/${id}/preview`;
  const areaData = [{ areaCode: 'E92000001', areaName: 'England', observations: [] }];
  const previewed = createFakeRepositories({
    indicators: {
      resolveId: async () => 'previewed-id',
      findDetailById: async () => ({ name: 'A draft', unanswered: ['polarity'] }) as never,
      listAreas: async () => [{ displayGroup: 'England', areas: [] }],
      findObservationsForAreas: async () => areaData,
      findObservationRange: async () => [],
      findRankingData: async () => areaData,
      findTableData: async () => [{ detail: { name: 'A draft' }, areaData }] as never,
      findScatterData: async () => ({ points: [], variants: [], rankings: [] }),
      search: async () => [{ shortId: 108, slug: 'a-draft', name: 'A draft' }],
      searchWithFilters: async () => ({ total: 0, limit: 10, indicators: [] }),
    },
    areas: { listByCodes: async () => [] },
  });
  const app = createTestApp(
    createFakeRepositories(),
    createFakeInternalRepositories({
      indicators: { findAccess: async () => stepRow },
      preview: {
        findVersion: async () => ({ id: 'version-id', slug: 'a-draft' }),
        repositoriesFor: () => ({ ...previewed, findDataState: async () => 'no-upload' }),
      },
    }),
  );

  it('answers the detail as found, with its data state', async () => {
    const response = await request(app)
      .get(`${prefix}/api/indicators/108`)
      .set('Cookie', await createCookie(['publisher']));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      name: 'A draft',
      unanswered: ['polarity'],
      dataState: 'no-upload',
    });
  });

  it.each([
    '/api/indicators/108/areas',
    '/api/indicators/108/data',
    '/api/indicators/108/range?displayGroup=England',
    '/api/indicators/108/ranking?areaCode=E92000001',
    '/api/indicator-data?indicator=108',
    '/api/indicator-scatter?indicator=108&indicator=241&areaCode=E92000001',
    '/api/indicators?q=draft',
    '/api/indicators/search?q=draft',
    '/api/areas/lookup?areaCode=E92000001',
  ])('mounts %s on the preview repositories', async (path) => {
    const response = await request(app)
      .get(`${prefix}${path}`)
      .set('Cookie', await createCookie(['publisher']));

    expect(response.status).toBe(200);
  });

  const teamB = createTestApp(
    createFakeRepositories(),
    createFakeInternalRepositories({
      indicators: { findAccess: async () => ({ ...stepRow, teamId: TEAM_IDS.teamB }) },
      preview: {
        findVersion: async () => ({ id: 'version-id', slug: 'a-draft' }),
        // Short id 108 is the previewed indicator, and 555 another one.
        repositoriesFor: () => ({
          ...previewed,
          indicators: {
            ...previewed.indicators,
            resolveId: async (shortId: number) => (shortId === 108 ? id : 'another-id'),
          },
          findDataState: async () => 'ready',
        }),
      },
    }),
  );

  it("answers a publisher in another team another indicator's detail as not found", async () => {
    const response = await request(teamB)
      .get(`${prefix}/api/indicators/555`)
      .set('Cookie', await createCookie(['publisher']));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('answers a publisher in another team the detail alone, as metadata only', async () => {
    const response = await request(teamB)
      .get(`${prefix}/api/indicators/108`)
      .set('Cookie', await createCookie(['publisher']));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      name: 'A draft',
      unanswered: ['polarity'],
      dataState: 'metadata-only',
    });
  });

  it.each([
    '/api/indicators/108/',
    '/api/indicators/a-draft',
    '/api/indicators/108/data',
    '/api/indicators/108/areas',
    '/api/indicators/search?q=draft',
    '/api/indicators/Search?q=draft',
    '/api/indicators/SEARCH?q=draft',
    '/api/indicators/facets',
    '/api/indicators/%73earch?q=draft',
    '/api/indicators?q=draft',
    '/api/indicator-data?indicator=108',
    '/api/areas/lookup?areaCode=E92000001',
    '/api/topics',
  ])('answers a publisher in another team not found for %s', async (path) => {
    const response = await request(teamB)
      .get(`${prefix}${path}`)
      .set('Cookie', await createCookie(['publisher']));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('serves the search in any case to a user who works on the indicator', async () => {
    const response = await request(app)
      .get(`${prefix}/api/indicators/Search?q=draft`)
      .set('Cookie', await createCookie(['publisher']));

    expect(response.status).toBe(200);
  });

  it('requires a session', async () => {
    expect((await request(app).get(`${prefix}/api/indicators/108`)).status).toBe(401);
  });
});
