import type { TagRow } from '@fphd/db';
import { createFakeRepositories } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import express, { type Express } from 'express';
import { describe, expect, it } from 'vitest';

import { expectToMatchSpec, specColumns } from './openapi.testing.ts';
import { TAG_COLUMNS, tagsRouter } from './tags.ts';

const rows: TagRow[] = [
  { kind: 'topic', slug: 'smoking', name: 'Smoking' },
  { kind: 'subtopic', slug: 'in-pregnancy', name: 'In pregnancy', topicSlug: 'smoking' },
  {
    kind: 'classification',
    slug: 'indicator-type-outcome',
    name: 'Outcome',
    dimension: 'indicator_type',
  },
  { kind: 'classification', slug: 'life-stage-adults', name: 'Adults', dimension: 'life_stage' },
];

function createTestApp(): Express {
  const app = express();

  app.use(
    tagsRouter(
      createFakeRepositories({
        reference: { dataVersion: async () => 'v1', listTags: async () => rows },
      }).reference,
    ),
  );

  return app;
}

describe('GET /v0/tags', () => {
  it('lists topics, subtopics and classifications as tags', async () => {
    const response = await request(createTestApp())
      .get('/v0/tags')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expectToMatchSpec('/v0/tags', 200, response.body);
    expect(response.body.data).toEqual([
      { slug: 'smoking', name: 'Smoking', type: 'topic', parent: null },
      { slug: 'smoking-in-pregnancy', name: 'In pregnancy', type: 'subtopic', parent: 'smoking' },
      { slug: 'indicator-type-outcome', name: 'Outcome', type: 'indicator-type', parent: null },
      { slug: 'life-stage-adults', name: 'Adults', type: 'life-stage', parent: null },
    ]);
  });

  it("prefixes a subtopic's slug with its topic's, since subtopic slugs repeat across topics", async () => {
    const response = await request(createTestApp())
      .get('/v0/tags?type=subtopic')
      .set('Accept', 'application/json');

    expect(response.body.data[0].slug).toBe('smoking-in-pregnancy');
  });

  it('keeps only the types asked for', async () => {
    const response = await request(createTestApp())
      .get('/v0/tags?type=subtopic,life-stage')
      .set('Accept', 'application/json');

    expect(response.body.data.map((tag: { slug: string }) => tag.slug)).toEqual([
      'smoking-in-pregnancy',
      'life-stage-adults',
    ]);
  });

  it("writes the spec's columns in CSV", async () => {
    const response = await request(createTestApp()).get('/v0/tags');

    expect(TAG_COLUMNS).toEqual(specColumns('Tag'));
    expect(response.text.split('\r\n')[1]).toBe('smoking,Smoking,topic,');
    expect(response.text.split('\r\n')[2]).toBe(
      'smoking-in-pregnancy,In pregnancy,subtopic,smoking',
    );
  });
});
