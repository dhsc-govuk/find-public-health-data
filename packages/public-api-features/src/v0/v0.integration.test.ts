import { createRepositories } from '@fphd/db';
import { apiLogin, createTestDb, type TestDb } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expectToMatchSpec } from './openapi.testing.ts';
import { v0Routes } from './routes.ts';

let testDb: TestDb;
let app: express.Express;

beforeAll(async () => {
  testDb = await createTestDb({ template: 'seeded' });
  // As the deployed app connects, so the grants on the views it reads are tested too.
  const db = testDb.connectDb({ login: apiLogin('public_api') });
  app = express().use(v0Routes(createRepositories(db)));
});

afterAll(async () => {
  await testDb.drop();
});

async function getJson(path: string) {
  return request(app).get(path).set('Accept', 'application/json');
}

describe('GET /v0/tags', () => {
  it('matches the spec', async () => {
    const response = await getJson('/v0/tags');

    expect(response.status).toBe(200);
    expectToMatchSpec('/v0/tags', 200, response.body);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('gives every tag a slug no other tag has, since the catalogue takes them in one list', async () => {
    const response = await getJson('/v0/tags');
    const slugs: string[] = response.body.data.map((tag: { slug: string }) => tag.slug);

    expect(slugs.length).toBe(new Set(slugs).size);
  });

  it('keeps its ETag until the data changes', async () => {
    const first = await request(app).get('/v0/tags');
    const second = await request(app)
      .get('/v0/tags')
      .set('If-None-Match', String(first.headers.etag));

    expect(second.status).toBe(304);
  });
});

describe('GET /v0/dimensions', () => {
  it('matches the spec, and every dimension and scheme it lists can be looked up', async () => {
    const list = await getJson('/v0/dimensions');

    expect(list.status).toBe(200);
    expectToMatchSpec('/v0/dimensions', 200, list.body);
    const slugs: string[] = list.body.data.map((dimension: { slug: string }) => dimension.slug);
    expect(slugs).toContain('sex');

    for (const slug of slugs) {
      const detail = await getJson(`/v0/dimensions/${slug}`);
      expect(detail.status).toBe(200);
      expectToMatchSpec('/v0/dimensions/{dimension}', 200, detail.body);

      for (const scheme of detail.body.schemes as { slug: string }[]) {
        const found = await getJson(`/v0/dimensions/${slug}/schemes/${scheme.slug}`);
        expect(found.status).toBe(200);
        expectToMatchSpec('/v0/dimensions/{dimension}/schemes/{scheme}', 200, found.body);
      }
    }
  });

  it('names sex m and f only', async () => {
    const response = await getJson('/v0/dimensions/sex');

    expect(response.body.values.map((value: { slug: string }) => value.slug).sort()).toEqual([
      'f',
      'm',
    ]);
  });
});

describe('areas', () => {
  it('lists area types that match the spec', async () => {
    const response = await getJson('/v0/area-types');

    expectToMatchSpec('/v0/area-types', 200, response.body);
    expect(response.body.data.map((type: { slug: string }) => type.slug)).toContain('regions');
  });

  it("lists today's counties without Northamptonshire, and 2020's with it", async () => {
    const today = await getJson('/v0/areas?areaType=counties-and-unitary-authorities');
    const in2020 = await getJson(
      '/v0/areas?areaType=counties-and-unitary-authorities&boundaries=2020',
    );
    const codes = (response: typeof today) =>
      response.body.data.map((area: { code: string }) => area.code);

    expectToMatchSpec('/v0/areas', 200, today.body);
    expect(codes(today)).toContain('E06000063');
    expect(codes(today)).not.toContain('E10000021');
    expect(codes(in2020)).toContain('E10000021');
    expect(codes(in2020)).not.toContain('E06000063');
  });

  it('finds the areas within a parent', async () => {
    const response = await getJson(
      '/v0/areas?areaType=counties-and-unitary-authorities&parent=E12000001',
    );
    const codes = response.body.data.map((area: { code: string }) => area.code);

    expect(codes).toContain('E06000047');
    expect(codes).not.toContain('E10000006');
  });

  it('returns an area with its region and England above it', async () => {
    const response = await getJson('/v0/areas/E06000047');

    expect(response.status).toBe(200);
    expectToMatchSpec('/v0/areas/{code}', 200, response.body);
    const parents = response.body.parents.map((parent: { code: string }) => parent.code);
    expect(parents).toContain('E12000001');
    expect(parents.at(-1)).toBe('E92000001');
  });
});
