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
    const response = await request(app).get('/api/internal');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication_required' });
  });

  it('rejects a signed-in user without the internal role', async () => {
    const response = await request(app)
      .get('/api/internal')
      .set('Cookie', await createCookie(['public']));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
  });

  it('allows an internal user', async () => {
    const response = await request(app)
      .get('/api/internal')
      .set('Cookie', await createCookie(['public', 'internal']));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ audience: 'internal' });
  });

  it('rejects and clears an invalid session', async () => {
    const response = await request(app)
      .get('/api/internal')
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
  it.each([
    '/api/internal/indicators',
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
        listPage: async () => ({ indicators: [], total: 0 }),
        findTeamId: async () => TEAM_IDS.teamA,
        // The handlers read only the draft's section columns.
        findDraftState: vi.fn().mockResolvedValue({ draft: unansweredDraft }),
      },
      ciMethods: { list: async () => [] },
      tags: {
        listOptions: async () => ({
          topics: [],
          subtopics: [],
          indicatorTypes: [],
          lifeStages: [],
          frameworks: [],
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
      .set('Cookie', await createCookie(['public', 'internal', 'publisher']));
    const asInternal = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['public', 'internal']));

    expect(asPublisher.status).toBe(200);
    expect(asInternal.status).toBe(403);
  });

  it.each([
    ['submit', { draftUpdatedAt: '2026-10-22T09:30:00.123Z' }],
    ['withdraw', { submissionNumber: 1 }],
  ])('mounts the %s step behind the publisher role', async (step, body) => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findTeamId: async () => TEAM_IDS.teamA,
        // The step routes read only the indicator's id and access from its row.
        findById: vi.fn().mockResolvedValue(stepRow),
        submit: async () => ({ ok: true }),
        withdraw: async () => ({ ok: true }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = `/api/internal/indicators/00000000-0000-7000-8000-000000000001/${step}`;

    const asPublisher = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['public', 'internal', 'publisher']))
      .send(body);
    const asInternal = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['public', 'internal']))
      .send(body);

    expect(asPublisher.status).toBe(204);
    expect(asInternal.status).toBe(403);
  });

  it('mounts the assign reviewers step behind the IMRG manager role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findById: vi.fn().mockResolvedValue(stepRow),
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
      .set('Cookie', await createCookie(['public', 'internal', 'imrg-manager']))
      .send(body);
    const asPublisher = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['public', 'internal', 'publisher']))
      .send(body);

    expect(asManager.status).toBe(204);
    expect(asPublisher.status).toBe(403);
  });

  it('mounts the review response behind the IMRG reviewer role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findById: vi.fn().mockResolvedValue({
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
      .set('Cookie', await createCookie(['public', 'internal', 'imrg-reviewer']))
      .send(body);
    const asPublisher = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['public', 'internal', 'publisher']))
      .send(body);

    expect(asReviewer.status).toBe(204);
    expect(asPublisher.status).toBe(403);

    // Its own body limit, over the default 100 kB.
    const long = await request(app)
      .post(path)
      .set('Cookie', await createCookie(['public', 'internal', 'imrg-reviewer']))
      .send({
        ...body,
        flags: flaggableTaskKeySchema.options.map((task) => ({ task, notes: '€'.repeat(10_000) })),
      });
    expect(long.status).toBe(204);
  });

  it('mounts the reviewer options behind the IMRG manager role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findById: async () => ({
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
      .set('Cookie', await createCookie(['public', 'internal', 'imrg-manager']));
    const asPublisher = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['public', 'internal', 'publisher']));

    expect(asManager.status).toBe(200);
    expect(asPublisher.status).toBe(403);
  });

  it('mounts the notes for reviewers', async () => {
    const id = '00000000-0000-7000-8000-000000000001';
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findNotesForReviewers: async () => ({
          teamId: TEAM_IDS.teamA,
          draftReviewers: [],
          version: { ...unansweredDraft, id },
        }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = `/api/internal/indicators/${id}/notes-for-reviewers`;

    const asManager = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['public', 'internal', 'imrg-manager']));

    expect(asManager.status).toBe(200);
  });

  it("mounts an indicator's history", async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findHistory: async () => ({
          teamId: TEAM_IDS.teamA,
          draftReviewers: [],
          versions: [],
          submissions: [],
          assignments: [],
          saves: [],
        }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/history';

    const asManager = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['public', 'internal', 'imrg-manager']));

    expect(asManager.status).toBe(200);
    expect(asManager.body).toEqual({ entries: [] });
  });

  it("mounts a reviewer's own notes", async () => {
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
      .set('Cookie', await createCookie(['public', 'internal', 'imrg-reviewer']));

    expect(asReviewer.status).toBe(200);
    expect(asReviewer.body).toEqual({ notes: [] });
  });

  it("mounts the publisher's reply to a review behind the editor guard", async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: {
        findTeamId: async () => TEAM_IDS.teamA,
        findRevisionRound: async () => ({
          hasDraft: true,
          draftLocked: false,
          submissionNumber: 1,
          submissionStatus: 'changes_requested',
          kind: 'minor_revisions',
          clarificationRequest: null,
          revisionResponse: null,
          flags: [{ task: 'polarity', notes: 'Is higher better?', cleared: false }],
        }),
      },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators/00000000-0000-7000-8000-000000000001/revision-response';

    const asPublisher = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['public', 'internal', 'publisher']));
    const asReviewer = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['public', 'internal', 'imrg-reviewer']));

    expect(asPublisher.status).toBe(200);
    expect(asPublisher.body).toMatchObject({ kind: 'minor_revisions', flaggedTaskCount: 1 });
    expect(asReviewer.status).toBe(403);
  });

  it('mounts the indicators under review behind the IMRG manager role', async () => {
    const internalRepositories = createFakeInternalRepositories({
      indicators: { listUnderReview: async () => ({ unassigned: [], assigned: [] }) },
    });
    const app = createTestApp(createFakeRepositories(), internalRepositories);
    const path = '/api/internal/indicators-under-review';

    const asManager = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['public', 'internal', 'imrg-manager']));
    const asPublisher = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['public', 'internal', 'publisher']));

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
      .set('Cookie', await createCookie(['public', 'internal', 'imrg-reviewer']));
    const asPublisher = await request(app)
      .get(path)
      .set('Cookie', await createCookie(['public', 'internal', 'publisher']));

    expect(asReviewer.status).toBe(200);
    expect(asPublisher.status).toBe(403);
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
      .set('Cookie', await createCookie(['public', 'internal', 'publisher', 'admin']));
    const asPublisher = await request(app)
      .get('/api/internal/topics')
      .set('Cookie', await createCookie(['public', 'internal', 'publisher']));

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
