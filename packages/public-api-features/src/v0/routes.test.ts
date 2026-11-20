import type { ReferenceRepository } from '@fphd/db';
import { createFakeRepositories } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import express, { type Express } from 'express';
import { describe, expect, it } from 'vitest';

import { expectToMatchSpec } from './openapi.testing.ts';
import { v0Routes } from './routes.ts';

const dataVersion = async () => '2026-11-01T00:00:00.000Z';

const stubs: Partial<ReferenceRepository> = {
  dataVersion,
  listTags: async () => [{ kind: 'topic', slug: 'smoking', name: 'Smoking' }],
};

// Behaviour every v0 route shares, tested once through /v0/tags.
function createTestApp(reference: Partial<ReferenceRepository> = stubs): Express {
  const app = express();

  app.use(v0Routes(createFakeRepositories({ reference })));

  return app;
}

describe('v0 formats', () => {
  it('returns CSV when the request names no format', async () => {
    const response = await request(createTestApp()).get('/v0/tags');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.text).toBe('slug,name,type,parent\r\nsmoking,Smoking,topic,\r\n');
  });

  it('returns CSV to a browser, which accepts anything after HTML', async () => {
    const response = await request(createTestApp())
      .get('/v0/tags')
      .set('Accept', 'text/html,application/xhtml+xml,*/*;q=0.8');

    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
  });

  it('returns JSON when Accept asks for it', async () => {
    const response = await request(createTestApp())
      .get('/v0/tags')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [{ slug: 'smoking', name: 'Smoking', type: 'topic', parent: null }],
    });
  });

  it('refuses a format the route cannot return', async () => {
    const response = await request(createTestApp()).get('/v0/tags').set('Accept', 'text/html');

    expect(response.status).toBe(406);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body.error).toBe('not_acceptable');
    expectToMatchSpec('/v0/tags', 406, response.body, 'application/problem+json');
  });
});

describe('v0 parameters', () => {
  it('rejects a parameter the route does not take', async () => {
    const response = await request(createTestApp()).get('/v0/tags?typ=topic');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'unknown_parameter',
      invalidParams: [{ name: 'typ', reason: 'unknown parameter' }],
    });
    expectToMatchSpec('/v0/tags', 400, response.body, 'application/problem+json');
  });

  it('rejects a parameter given more than once', async () => {
    const response = await request(createTestApp()).get('/v0/tags?type=topic&type=subtopic');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'invalid_parameter',
      invalidParams: [{ name: 'type', reason: 'given more than once' }],
    });
  });

  it('rejects an invalid value', async () => {
    const response = await request(createTestApp()).get('/v0/tags?type=topic,colour');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'invalid_parameter',
      invalidParams: [{ name: 'type' }],
    });
  });
});

describe('v0 caching', () => {
  it('sends an ETag, Cache-Control and Vary: Accept', async () => {
    const response = await request(createTestApp()).get('/v0/tags');

    expect(response.headers.etag).toMatch(/^"[\w-]+"$/);
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.headers.vary).toBe('Accept');
  });

  it('answers 304 to a matching If-None-Match without reading the data', async () => {
    const app = createTestApp();
    const first = await request(app).get('/v0/tags');
    // listTags isn't stubbed, so reading the data would fail the request.
    const versionOnly = createTestApp({ dataVersion });

    const response = await request(versionOnly)
      .get('/v0/tags')
      .set('If-None-Match', String(first.headers.etag));

    expect(response.status).toBe(304);
  });

  it('gives each format its own ETag', async () => {
    const app = createTestApp();
    const csv = await request(app).get('/v0/tags');
    const json = await request(app).get('/v0/tags').set('Accept', 'application/json');

    expect(csv.headers.etag).not.toBe(json.headers.etag);
  });

  it('changes the ETag when the data changes', async () => {
    const before = await request(createTestApp()).get('/v0/tags');
    const after = await request(
      createTestApp({ ...stubs, dataVersion: async () => '2026-11-02T00:00:00.000Z' }),
    ).get('/v0/tags');

    expect(before.headers.etag).not.toBe(after.headers.etag);
  });
});

describe('v0 cross-origin requests', () => {
  it('allows any origin and exposes the headers a client reads', async () => {
    const response = await request(createTestApp()).get('/v0/tags');

    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-expose-headers']).toBe('ETag, Link');
  });

  it('answers a preflight request', async () => {
    const response = await request(createTestApp()).options('/v0/tags');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-headers']).toBe('Accept, If-None-Match');
  });
});

describe('v0 errors', () => {
  it('answers an unknown path with a 404 problem', async () => {
    const response = await request(createTestApp()).get('/v0/nothing-here');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      error: 'not_found',
    });
  });

  it('answers a thrown error with a 500 problem', async () => {
    const app = createTestApp({
      dataVersion,
      listTags: async () => {
        throw new Error('boom');
      },
    });

    const response = await request(app).get('/v0/tags');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ status: 500, error: 'internal_error' });
  });

  it('leaves paths outside /v0 to the app', async () => {
    const response = await request(createTestApp()).get('/api/topics');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).not.toMatch(/problem/);
  });
});

describe('GET /v0/openapi.yaml', () => {
  it('serves the spec', async () => {
    const response = await request(createTestApp()).get('/v0/openapi.yaml');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/yaml/);
    expect(response.text).toMatch(/^openapi: 3\.1\.0/);
  });
});
