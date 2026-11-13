import { createRepositories, type Database, schema } from '@fphd/db';
import { apiLogin, createTestDb, type TestDb } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import { publicApiRoutes } from '@fphd/public-api-features';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient } from '@fphd/web-server/testing';
import { eq, inArray } from 'drizzle-orm';
import express from 'express';
import { RouterContextProvider } from 'react-router';
import { afterAll, beforeAll, expect, it } from 'vitest';
// A pre-change loader capture prevents shared selection code from redefining the expected scatter.
import before from './fixtures/scatter-before.json';
import { loadIndicatorPage } from './single-loader.ts';

let database: TestDb;
let db: Database;
let app: express.Express;
beforeAll(async () => {
  database = await createTestDb({ template: 'seeded' });
  db = database.connectDb({ login: apiLogin('public_api') });
  app = express().use(publicApiRoutes(createRepositories(db)));
});
afterAll(async () => {
  await database.drop();
});

async function load(url: string, onRead: (path: string) => void = () => {}) {
  const context = new RouterContextProvider();
  context.set(apiContext, {
    ...createFakeApiClient(),
    async get(path, schema) {
      onRead(path);
      const response = await request(app).get(path);
      if (response.status !== 200)
        throw new Response('API read failed', { status: response.status });
      return schema.parse(response.body);
    },
  });
  const page = await loadIndicatorPage({
    context,
    request: new Request(url),
    params: { slug: new URL(url).pathname.split('/').at(-1) },
  } as unknown as Parameters<typeof loadIndicatorPage>[0]);
  const [, comparison] = await Promise.all([page.data, page.comparison]);
  return comparison;
}

it.each(before)('preserves the old loader scatter for $ids in $group', async (fixture) => {
  const comparison = await load(fixture.url);
  expect(comparison.compareAreaGroup).toBe(fixture.group);
  expect(comparison.scatter).toEqual(fixture.scatter);
});

it('keeps the saved axis order, periods and every area value', async () => {
  const fixture = before.find(
    ({ ids, group }) => ids[1] === 40501 && group === 'Local authorities',
  );
  if (!fixture) throw new Error('Expected a nonempty comparison fixture');
  const comparison = await load(`${fixture.url}&scatter-x=40501&scatter-y=108`);
  expect(comparison.scatter?.points).toEqual(
    fixture.scatter.points.map((point) => ({
      ...point,
      x: point.y,
      y: point.x,
    })),
  );
});

it('preserves the old loader scatter when either completed read model is unavailable', async () => {
  for (const shortId of [108, 40501]) {
    const fixture = before.find(
      ({ ids, group }) => ids[1] === 40501 && group === 'Statistical regions',
    );
    if (!fixture) throw new Error('Expected a comparison fixture');
    await database.db
      .delete(schema.observationSeriesBatch)
      .where(
        inArray(
          schema.observationSeriesBatch.indicatorId,
          database.db
            .select({ id: schema.indicator.id })
            .from(schema.indicator)
            .where(eq(schema.indicator.shortId, shortId)),
        ),
      );
    expect((await load(fixture.url)).scatter).toEqual(fixture.scatter);
  }
});

it.each([40501])(
  'uses ranking values without history for seeded pair ending in %i',
  async (other) => {
    const fixture = before.find(
      ({ ids, group }) => ids[1] === other && group === 'Local authorities',
    );
    if (!fixture) throw new Error('Expected fixture');
    const paths: string[] = [];
    const comparison = await load(fixture.url, (path) => paths.push(path));
    expect(comparison.scatter).toEqual(fixture.scatter);
    expect(paths.some((path) => path.startsWith('/api/indicator-scatter'))).toBe(false);
  },
);

it('checks canonical history before returning an empty scatter for different age segments', async () => {
  const fixture = before.find(
    ({ ids, group }) => ids[1] === 92443 && group === 'Local authorities',
  );
  if (!fixture) throw new Error('Expected fixture');
  const paths: string[] = [];
  const comparison = await load(fixture.url, (path) => paths.push(path));
  expect(comparison.scatter).toEqual(fixture.scatter);
  expect(paths.filter((path) => path.startsWith('/api/indicator-scatter'))).toHaveLength(1);
});
