import { createRepositories, type Database, schema } from '@fphd/db';
import { apiLogin, createTestDb, type TestDb } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import { publicApiRoutes } from '@fphd/public-api-features';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient } from '@fphd/web-server/testing';
import { eq, inArray } from 'drizzle-orm';
import express from 'express';
import { RouterContextProvider } from 'react-router';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { expandScatterComparison } from './compact-data.ts';
import captured from './fixtures/scatter-before.json';
import { loadIndicatorPage } from './single-loader.ts';

const before = captured.map((fixture) => ({
  ...fixture,
  scatter: {
    points: fixture.scatter.points.map(({ period, fromDate, toDate, ...point }) => ({
      ...point,
      xPeriod: { fromDate, toDate },
      yPeriod: { fromDate, toDate },
    })),
  },
}));

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
  if (page.dataPlaceholder !== null) throw new Error('Expected the page to load its data');
  const [, comparison] = await Promise.all([page.data, page.comparison]);
  return {
    ...comparison,
    scatter: comparison.scatter ? expandScatterComparison(comparison.scatter) : undefined,
  };
}

it('keeps the seeded diabetes and smoking comparison within its statement budget', async () => {
  const query = vi.spyOn(db.$client, 'unsafe');
  const paths: string[] = [];
  try {
    const comparison = await load(
      'http://localhost/indicator/diabetes-qof-prevalence?tab-indicator=compare&compareWith=smoking-prevalence-in-adults-aged-18-and-over-current-smokers-aps&as=E07000223&as=E07000032',
      (path) => paths.push(path),
    );
    expect(comparison.scatter?.points.length).toBeGreaterThan(1);
    expect(query.mock.calls.length).toBeLessThanOrEqual(34);
    expect(paths.filter((path) => path.startsWith('/api/indicator-scatter?'))).toHaveLength(1);
    expect(paths.some((path) => /\/(indicator-data|ranking)\?/.test(path))).toBe(false);
    for (const variant of comparison.scatter?.variants ?? []) {
      expect(variant.points).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'E92000001',
            xPeriod: { fromDate: '2024-04-01', toDate: '2025-03-31' },
            yPeriod: expect.objectContaining({ toDate: '2024-12-31' }),
          }),
        ]),
      );
    }
  } finally {
    query.mockRestore();
  }
});

it.each(before.filter(({ scatter }) => scatter.points.length > 0))(
  'preserves the old loader scatter for $ids in $group',
  async (fixture) => {
    const comparison = await load(fixture.url);
    expect(comparison.compareAreaGroup).toBe(fixture.group);
    expect(comparison.scatter).toMatchObject(fixture.scatter);
  },
);

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
      xPeriod: point.yPeriod,
      yPeriod: point.xPeriod,
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
    expect((await load(fixture.url)).scatter).toMatchObject(fixture.scatter);
  }
});

it.each([40501])(
  'keeps canonical values alongside sex variants for seeded pair ending in %i',
  async (other) => {
    const fixture = before.find(
      ({ ids, group }) => ids[1] === other && group === 'Local authorities',
    );
    if (!fixture) throw new Error('Expected fixture');
    const paths: string[] = [];
    const comparison = await load(fixture.url, (path) => paths.push(path));
    expect(comparison.scatter).toMatchObject(fixture.scatter);
    expect(paths.filter((path) => path.startsWith('/api/indicator-scatter'))).toHaveLength(1);
    expect(paths.some((path) => path.startsWith('/api/indicator-data?'))).toBe(false);
  },
);

it.each(before.filter(({ scatter }) => scatter.points.length === 0))(
  'plots independent headline values for $ids in $group',
  async (fixture) => {
    const comparison = await load(fixture.url);
    expect(comparison.scatter?.points.length).toBeGreaterThan(1);
    expect(comparison.scatter?.points.some(({ code }) => code === 'E92000001')).toBe(true);
  },
);

it('loads the seeded diabetes comparison with separate financial and calendar periods', async () => {
  const comparison = await load(
    'http://localhost/indicator/diabetes-qof-prevalence?compareWith=mortality-rate-for-deaths-involving-diabetes-all-ages',
  );
  const variants = comparison.scatter?.variants;
  expect(variants?.length).toBeGreaterThan(0);
  for (const variant of variants ?? []) {
    expect(variant.points.length).toBeGreaterThan(1);
    expect(variant.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'E92000001',
          xPeriod: { fromDate: '2024-04-01', toDate: '2025-03-31' },
          yPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
        }),
      ]),
    );
  }
});
