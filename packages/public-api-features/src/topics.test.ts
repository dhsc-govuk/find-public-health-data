import type { Topic } from '@fphd/db';
import { createFakeRepositories, type FakeRepositoryOverrides } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import express, { type Express } from 'express';
import { describe, expect, it } from 'vitest';

import { topicsRouter } from './topics.ts';

const topicA: Topic = {
  id: '00000000-0000-7000-8000-000000000001',
  slug: 'topic-a',
  title: 'Topic A',
  description: 'All about topic A.',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T00:00:00.000Z'),
};

const topicB: Topic = {
  id: '00000000-0000-7000-8000-000000000002',
  slug: 'topic-b',
  title: 'Topic B',
  description: 'All about topic B.',
  createdAt: new Date('2024-02-01T00:00:00.000Z'),
  updatedAt: new Date('2024-02-02T00:00:00.000Z'),
};

// The router alone, on a bare Express app: these tests cover its responses, not what
// `createApiApp` wraps around it. The sibling router tests build their apps the same way.
function createTestApp(overrides: FakeRepositoryOverrides['topics'] = {}): Express {
  const app = express();

  app.use(topicsRouter(createFakeRepositories({ topics: overrides }).topics));

  return app;
}

describe('GET /api/topics', () => {
  it('lists topics in the order the repository returns them, as ISO timestamps', async () => {
    const app = createTestApp({ list: async () => [topicA, topicB] });

    const response = await request(app).get('/api/topics');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        slug: 'topic-a',
        title: 'Topic A',
        description: 'All about topic A.',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      },
      {
        slug: 'topic-b',
        title: 'Topic B',
        description: 'All about topic B.',
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-02T00:00:00.000Z',
      },
    ]);
  });

  it('does not leak the internal row id in a topic listing', async () => {
    const app = createTestApp({ list: async () => [topicA] });

    const response = await request(app).get('/api/topics');

    expect(response.body[0]).not.toHaveProperty('id');
  });
});

describe('GET /api/topics/:slug', () => {
  it('finds a topic by slug, as ISO timestamps', async () => {
    const app = createTestApp({ findBySlug: async () => topicA, listSubtopics: async () => [] });

    const response = await request(app).get('/api/topics/topic-a');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      content: null,
      subtopics: [],
      slug: 'topic-a',
      title: 'Topic A',
      description: 'All about topic A.',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    });
  });

  it('does not leak the internal row id in a topic detail', async () => {
    const app = createTestApp({ findBySlug: async () => topicA, listSubtopics: async () => [] });

    const response = await request(app).get('/api/topics/topic-a');

    expect(response.body).not.toHaveProperty('id');
  });

  it('returns the standard not-found body for an unknown slug', async () => {
    const app = createTestApp({ findBySlug: async () => undefined });

    const response = await request(app).get('/api/topics/no-such-topic');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('serves reviewed diabetes overview and publication links', async () => {
    const app = createTestApp({
      findBySlug: async () => ({ ...topicA, slug: 'diabetes' }),
      listSubtopics: async () => [{ slug: 'prevalence-and-risk', title: 'Prevalence and risk' }],
    });
    const response = await request(app).get('/api/topics/diabetes');
    expect(response.body.subtopics).toEqual([
      { slug: 'prevalence-and-risk', title: 'Prevalence and risk' },
    ]);
    expect(response.body.content.highlightedIndicatorIds).toEqual([241, 93995, 94262, 94273]);
    expect(response.body.content.moreInformation.sections[0].links[0].url).toBe(
      'https://www.gov.uk/government/statistics/diabetes-profile-update-april-2026',
    );
  });
});

describe('GET /api/topics/:slug/trends', () => {
  it('serves the repository trend summary for a published topic', async () => {
    const summary = {
      total: 54,
      better: 4,
      worse: 1,
      unchanged: 2,
      increasing: 13,
      decreasing: 0,
      unavailable: 34,
    };
    const app = createTestApp({
      findBySlug: async () => topicA,
      trendSummary: async () => summary,
    });
    const response = await request(app).get('/api/topics/topic-a/trends');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(summary);
  });
});

describe('a segment that is not a slug', () => {
  it.each([
    '/api/topics/%00',
    '/api/topics/%00/trends',
    '/api/topics/topic%7Fa',
    '/api/topics/Topic-A',
    `/api/topics/${'a'.repeat(201)}`,
  ])('answers %s with not-found without touching the repository', async (path) => {
    // No stub: reaching the repository would throw and answer 500.
    const response = await request(createTestApp()).get(path);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });
});
