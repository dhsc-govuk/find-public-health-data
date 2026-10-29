import { request } from '@fphd/express/testing';
import express, { type Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { editVersion } from './edit-version.ts';
import {
  createFakeInternalRepositories,
  type FakeInternalRepositoryOverrides,
  TEST_USER_ID,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';
import type { TopicRow } from './topic-repository.ts';
import { internalTopicsRouter } from './topics.ts';

const topic: TopicRow = {
  id: '00000000-0000-7000-8000-000000000001',
  slug: 'topic-a',
  title: 'Topic A',
  description: 'All about topic A.',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  createdBy: TEST_USER_ID,
  updatedBy: TEST_USER_ID,
};

const validSubmission = { title: 'Topic A', slug: 'topic-a', description: 'All about topic A.' };

const topicVersion = editVersion(validSubmission);

// The router alone, on a bare Express app: these tests cover its status mapping, not what
// `createApiApp` wraps around it.
function createTestApp(overrides: FakeInternalRepositoryOverrides['topics'] = {}): Express {
  const repositories = createFakeInternalRepositories({ topics: overrides });
  const app = express();

  app.use(express.json());
  app.use(internalTopicsRouter(repositories.topics, testSessionVerifier));

  return app;
}

function adminCookie(roles: readonly string[] = ['internal', 'publisher', 'admin']) {
  return testSessionCookie(roles);
}

describe('the internal topics surface', () => {
  const paths = [
    ['get', '/api/internal/topics'],
    ['post', '/api/internal/topics'],
    ['get', `/api/internal/topics/${topic.id}`],
    ['put', `/api/internal/topics/${topic.id}`],
    ['delete', `/api/internal/topics/${topic.id}`],
  ] as const;

  it.each(paths)('rejects an anonymous %s %s', async (method, path) => {
    const response = await request(createTestApp())[method](path);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication_required' });
  });

  it.each(paths)('rejects a signed-in non-admin %s %s', async (method, path) => {
    const response = await request(createTestApp())
      [method](path)
      .set('Cookie', await adminCookie(['internal', 'publisher']));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden' });
  });
});

describe('GET /api/internal/topics', () => {
  it('lists topics with their ids, as ISO timestamps', async () => {
    const response = await request(createTestApp({ list: async () => [topic] }))
      .get('/api/internal/topics')
      .set('Cookie', await adminCookie());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: topic.id,
        slug: 'topic-a',
        title: 'Topic A',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });
});

describe('POST /api/internal/topics', () => {
  async function post(app: Express, body: unknown) {
    return request(app)
      .post('/api/internal/topics')
      .set('Cookie', await adminCookie())
      .send(body as object);
  }

  it('creates the topic and returns it with the id the database minted', async () => {
    const app = createTestApp({ create: async () => ({ ok: true, topic }) });

    const response = await post(app, validSubmission);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      topic: {
        id: topic.id,
        slug: 'topic-a',
        title: 'Topic A',
        description: 'All about topic A.',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        version: topicVersion,
      },
    });
  });

  it('trims the submitted values before creating', async () => {
    let written: unknown;
    const app = createTestApp({
      create: async (values) => {
        written = values;
        return { ok: true, topic };
      },
    });

    await post(app, { title: '  Topic A  ', slug: ' topic-a ', description: ' A description. ' });

    expect(written).toEqual({ title: 'Topic A', slug: 'topic-a', description: 'A description.' });
  });

  it('creates the topic as the signed-in user', async () => {
    let writer: unknown;
    const app = createTestApp({
      create: async (_values, actor) => {
        writer = actor;
        return { ok: true, topic };
      },
    });

    await post(app, validSubmission);

    expect(writer).toEqual({ userId: TEST_USER_ID, requestId: null });
  });

  it('rejects an invalid submission with a field message', async () => {
    const response = await post(createTestApp(), { ...validSubmission, title: '   ' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'validation_failed',
      fieldErrors: { title: 'Enter a topic name' },
    });
  });

  it('returns a 409 with a slug field message when the slug is taken', async () => {
    const app = createTestApp({ create: async () => ({ ok: false, reason: 'slug_taken' }) });

    const response = await post(app, validSubmission);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'slug_taken',
      fieldErrors: { slug: 'This slug is already used' },
    });
  });

  it('does not reach the repository when the submission is invalid', async () => {
    // Nothing is stubbed, so any repository call throws and the response would be a 500.
    const response = await post(createTestApp(), { title: '', slug: '', description: '' });

    expect(response.status).toBe(400);
  });
});

describe('GET /api/internal/topics/:id', () => {
  it('returns the topic with its description and how many indicators link to it', async () => {
    let counted: string | undefined;
    const app = createTestApp({
      findById: async () => topic,
      countLinkedIndicators: async (id) => {
        counted = id;
        return 3;
      },
    });

    const response = await request(app)
      .get(`/api/internal/topics/${topic.id}`)
      .set('Cookie', await adminCookie());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: topic.id,
      description: 'All about topic A.',
      linkedIndicatorCount: 3,
    });
    expect(counted).toBe(topic.id);
  });

  it('returns the standard not-found body for an unknown id', async () => {
    const app = createTestApp({
      findById: async () => undefined,
      countLinkedIndicators: async () => 0,
    });
    const response = await request(app)
      .get('/api/internal/topics/00000000-0000-7000-8000-0000000000ff')
      .set('Cookie', await adminCookie());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('refuses a malformed id rather than handing it to the database', async () => {
    const response = await request(createTestApp())
      .get('/api/internal/topics/not-a-uuid')
      .set('Cookie', await adminCookie());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });
});

describe('PUT /api/internal/topics/:id', () => {
  async function put(app: Express, body: object, id: string = topic.id) {
    return request(app)
      .put(`/api/internal/topics/${id}`)
      .set('Cookie', await adminCookie())
      .send({ version: topicVersion, ...body });
  }

  it('reports a write that changed the topic', async () => {
    const app = createTestApp({
      update: async () => ({ ok: true, topic, changed: true }),
    });

    const response = await put(app, validSubmission);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      changed: true,
      topic: {
        id: topic.id,
        slug: 'topic-a',
        title: 'Topic A',
        description: 'All about topic A.',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        version: topicVersion,
      },
    });
  });

  it('saves only the topic the form was shown, taking its version from the fields it edits', async () => {
    const update = vi.fn().mockResolvedValue({ ok: true, topic, changed: true });

    await put(createTestApp({ update }), validSubmission);

    const precondition = update.mock.lastCall?.[3];
    expect(precondition.version).toBe(topicVersion);
    expect(precondition.versionOf(topic)).toBe(topicVersion);
    expect(precondition.versionOf({ ...topic, updatedAt: new Date() })).toBe(topicVersion);
    expect(precondition.versionOf({ ...topic, title: 'Renamed since' })).not.toBe(topicVersion);
  });

  it('answers changed, with the version now, for a topic changed since the form showed it', async () => {
    const version = editVersion({ ...validSubmission, title: 'Renamed since' });
    const app = createTestApp({ update: async () => ({ ok: false, reason: 'changed', version }) });

    const response = await put(app, validSubmission);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'changed', version });
  });

  it.each([
    ['no version', { version: undefined }],
    ['a version the API did not make', { version: 'stale' }],
  ])('refuses a save with %s without reaching the repository', async (_case, version) => {
    // Nothing is stubbed, so any repository call throws and the response would be a 500.
    const response = await put(createTestApp(), { ...validSubmission, ...version });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_version' });
  });

  it('reports a submission that changed nothing', async () => {
    const app = createTestApp({ update: async () => ({ ok: true, topic, changed: false }) });

    const response = await put(app, validSubmission);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ changed: false });
  });

  it('trims the submitted values before writing them', async () => {
    let written: unknown;
    const app = createTestApp({
      update: async (_id, values) => {
        written = values;
        return { ok: true, topic, changed: true };
      },
    });

    await put(app, { title: '  Topic A  ', slug: ' topic-a ', description: ' A description. ' });

    expect(written).toEqual({
      title: 'Topic A',
      slug: 'topic-a',
      description: 'A description.',
    });
  });

  it('updates the topic as the signed-in user', async () => {
    let writer: unknown;
    const app = createTestApp({
      update: async (_id, _values, actor) => {
        writer = actor;
        return { ok: true, topic, changed: true };
      },
    });

    await put(app, validSubmission);

    expect(writer).toEqual({ userId: TEST_USER_ID, requestId: null });
  });

  it.each([
    ['title', { ...validSubmission, title: '   ' }, { title: 'Enter a topic name' }],
    [
      'description',
      { ...validSubmission, description: '' },
      { description: 'Enter a description' },
    ],
    ['missing slug', { ...validSubmission, slug: '' }, { slug: 'Enter a slug' }],
    [
      'malformed slug',
      { ...validSubmission, slug: 'Not A Slug' },
      { slug: 'Slug must be lowercase letters or numbers, separated by hyphens' },
    ],
  ])('rejects an invalid %s with a field message', async (_case, body, fieldErrors) => {
    const response = await put(createTestApp(), body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'validation_failed', fieldErrors });
  });

  it('refuses a malformed id', async () => {
    const response = await put(createTestApp(), validSubmission, 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it('returns a 404 when the topic has gone', async () => {
    const app = createTestApp({ update: async () => ({ ok: false, reason: 'not_found' }) });

    const response = await put(app, validSubmission);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('returns a 409 with a slug field message when the slug is taken', async () => {
    const app = createTestApp({ update: async () => ({ ok: false, reason: 'slug_taken' }) });

    const response = await put(app, validSubmission);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'slug_taken',
      fieldErrors: { slug: 'This slug is already used' },
    });
  });

  it('does not reach the repository when the submission is invalid', async () => {
    // Nothing is stubbed, so any repository call throws and the response would be a 500.
    const response = await put(createTestApp(), { title: '', slug: '', description: '' });

    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/internal/topics/:id', () => {
  async function del(app: Express, id: string = topic.id) {
    return request(app)
      .delete(`/api/internal/topics/${id}`)
      .set('Cookie', await adminCookie());
  }

  it('deletes the topic as the signed-in user', async () => {
    let writer: unknown;
    const app = createTestApp({
      delete: async (_id, actor) => {
        writer = actor;
        return { ok: true };
      },
    });

    await request(app)
      .delete(`/api/internal/topics/${topic.id}`)
      .set('Cookie', await adminCookie());

    expect(writer).toEqual({ userId: TEST_USER_ID, requestId: null });
  });

  it('deletes the topic and answers with an empty 204', async () => {
    const app = createTestApp({ delete: async () => ({ ok: true }) });

    const response = await del(app);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });

  it('passes the id through to the repository', async () => {
    let asked: string | undefined;
    const app = createTestApp({
      delete: async (id) => {
        asked = id;
        return { ok: true };
      },
    });

    await del(app);

    expect(asked).toBe(topic.id);
  });

  it('refuses a malformed id rather than handing it to the database', async () => {
    const response = await del(createTestApp(), 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_id' });
  });

  it('answers a 409 while indicators link to the topic', async () => {
    const app = createTestApp({ delete: async () => ({ ok: false, reason: 'in_use' }) });

    const response = await del(app);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'in_use' });
  });

  it('returns a 404 when the topic has already gone', async () => {
    const app = createTestApp({ delete: async () => ({ ok: false, reason: 'not_found' }) });

    const response = await del(app);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });
});
