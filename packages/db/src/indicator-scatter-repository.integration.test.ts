import {
  headlineSeries,
  observationSegmentKey,
  pairedAreaValues,
} from '@fphd/utils/observation-series';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { replaceObservationSeries } from '../../internal-read-models/src/observation-series.ts';
import type { Database } from './client.ts';
import { getIndicatorObservationData } from './indicator-observation-repository.ts';
import {
  getCachedScatterAreas,
  getIndicatorScatterData,
  getPublishedIndicatorScatterData,
} from './indicator-scatter-repository.ts';
import {
  area,
  observation,
  observationSeries,
  observationSeriesBatch,
  publishedIndicator,
} from './schema/index.ts';
import { apiLogin, createTestDb, type TestDb } from './testing.ts';

let database: TestDb;
let db: Database;
let ids: [string, string];
const codes = ['E06000052', 'E92000001', 'UNKNOWN'];
beforeEach(async () => {
  database = await createTestDb({ template: 'seeded' });
  db = database.connectDb({ login: apiLogin('public_api') });
  const indicators = await db
    .select({ id: publishedIndicator.id, shortId: publishedIndicator.shortId })
    .from(publishedIndicator);
  const first = indicators.find(({ shortId }) => shortId === 108);
  const second = indicators.find(({ shortId }) => shortId === 40501);
  if (!first || !second) throw new Error('Expected comparison seed');
  ids = [first.id, second.id];
});
afterEach(async () => {
  await database.drop();
});

async function canonical() {
  const data = await getIndicatorObservationData(db, ids, codes, 'table');
  return pairedAreaValues(data.get(ids[0])?.areaData ?? [], data.get(ids[1])?.areaData ?? []);
}

it('reads bounded cached candidates, markers and benchmarks in one statement', async () => {
  const expected = await canonical();
  expect(expected).toHaveLength(2);
  const query = vi.spyOn(db.$client, 'unsafe');
  try {
    const cached = await getCachedScatterAreas(db, ids, codes);
    expect(query).toHaveBeenCalledTimes(1);
    expect(cached).toBeDefined();
    expect(cached?.get(ids[0])?.map(({ areaCode }) => areaCode)).toEqual(codes.slice(0, 2));
    expect(pairedAreaValues(cached?.get(ids[0]) ?? [], cached?.get(ids[1]) ?? [])).toEqual(
      expected,
    );
  } finally {
    query.mockRestore();
  }
});

it('resolves both published axes in one bulk read without coalescing ranking lookups', async () => {
  const expected = (await canonical()).map((point) => ({ ...point, x: point.y, y: point.x }));
  const query = vi.spyOn(db.$client, 'unsafe');
  try {
    expect(await getPublishedIndicatorScatterData(db, [40501, 108], codes)).toEqual(expected);
    expect(query).toHaveBeenCalledTimes(2);
  } finally {
    query.mockRestore();
  }
  expect(await getPublishedIndicatorScatterData(db, [108, 999999], codes)).toBeUndefined();
});

it.each(['A"quote', 'A,comma', 'A{brace}', 'A\\slash'])(
  'binds area code %s as an array element and preserves requested order',
  async (code) => {
    await database.db
      .update(area)
      .set({ code })
      .where(eq(area.code, codes[0] ?? ''));
    const requested = [codes[1] ?? '', code];
    const data = await getIndicatorObservationData(db, ids, requested, 'table');
    const expected = pairedAreaValues(
      data.get(ids[0])?.areaData ?? [],
      data.get(ids[1])?.areaData ?? [],
    );
    expect(expected).toHaveLength(2);
    const query = vi.spyOn(db.$client, 'unsafe');
    try {
      const cached = await getCachedScatterAreas(db, ids, requested);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0]?.[1]).toContainEqual(requested);
      expect(cached?.get(ids[0])?.map(({ areaCode }) => areaCode)).toEqual(requested);
      expect(pairedAreaValues(cached?.get(ids[0]) ?? [], cached?.get(ids[1]) ?? [])).toEqual(
        expected,
      );
    } finally {
      query.mockRestore();
    }
  },
);

it('retains nulls, zeroes and an older common period while using current published values', async () => {
  const original = await getCachedScatterAreas(db, ids, codes);
  const latest = original?.get(ids[0])?.[0]?.observations.at(-1);
  if (!latest) throw new Error('Expected recent points');
  await database.db
    .update(observation)
    .set({ value: null })
    .where(
      and(
        eq(observation.indicatorId, ids[1]),
        eq(observation.fromDate, latest.fromDate),
        eq(observation.toDate, latest.toDate),
      ),
    );
  const expected = await canonical();
  expect(expected.length).toBeGreaterThan(0);
  expect(
    expected.every(
      (point) =>
        point.toDate < latest.toDate ||
        (point.toDate === latest.toDate && point.fromDate < latest.fromDate),
    ),
  ).toBe(true);
  const common = expected[0];
  if (!common) throw new Error('Expected a common period');
  await database.db
    .update(observation)
    .set({ value: 0 })
    .where(
      and(
        eq(observation.indicatorId, ids[0]),
        eq(observation.fromDate, common.fromDate),
        eq(observation.toDate, common.toDate),
      ),
    );
  const points = await getIndicatorScatterData(db, ids, codes);
  expect(points).toEqual(await canonical());
  expect(points.every((point) => point.x === 0)).toBe(true);
});

it('falls back for stale point IDs and missing batch markers', async () => {
  const expected = await canonical();
  await database.db
    .update(observationSeries)
    .set({
      recentObservationIds: sql`array_append(${observationSeries.recentObservationIds}, ${'00000000-0000-0000-0000-000000000001'}::uuid)`,
    })
    .where(eq(observationSeries.indicatorId, ids[0]));
  expect(await getCachedScatterAreas(db, ids, codes)).toBeUndefined();
  expect(await getIndicatorScatterData(db, ids, codes)).toEqual(expected);
  await database.db
    .delete(observationSeriesBatch)
    .where(eq(observationSeriesBatch.indicatorId, ids[1]));
  expect(await getCachedScatterAreas(db, ids, codes)).toBeUndefined();
  expect(await getIndicatorScatterData(db, ids, codes)).toEqual(expected);
});

it('uses canonical history for an area code shared by historical areas', async () => {
  const [original] = await database.db.select().from(area).where(eq(area.code, 'E06000052'));
  if (!original) throw new Error('Expected Cornwall');
  await database.db
    .update(area)
    .set({ validFrom: '1900-01-01', validTo: '2000-12-31', isCurrent: false })
    .where(eq(area.id, original.id));
  await database.db.insert(area).values({
    ...original,
    id: undefined,
    validFrom: '2001-01-01',
    validTo: null,
    isCurrent: true,
  });
  expect(await getCachedScatterAreas(db, ids, codes)).toBeUndefined();
  expect(await getIndicatorScatterData(db, ids, codes)).toEqual(await canonical());
});

it('keeps tied sex headlines identical when the cached query uses canonical data', async () => {
  const models = await database.db
    .selectDistinct({ id: observationSeries.indicatorId, batch: observationSeries.uploadBatchId })
    .from(observationSeries)
    .where(inArray(observationSeries.indicatorId, ids));
  const aggregates = database.db
    .select({ key: observationSeries.dimensionKey })
    .from(observationSeries)
    .where(
      and(
        inArray(observationSeries.indicatorId, ids),
        eq(observationSeries.sex, ''),
        eq(observationSeries.periodType, 'all'),
      ),
    );
  await database.db
    .delete(observation)
    .where(
      and(inArray(observation.indicatorId, ids), inArray(observation.dimensionKey, aggregates)),
    );
  for (const model of models)
    await database.db.transaction((tx) => replaceObservationSeries(tx, model.id, model.batch));
  const canonical = await getIndicatorObservationData(db, ids, codes, 'table');
  const ordered = (id: string) =>
    (canonical.get(id)?.areaData ?? []).map((area) => ({
      ...area,
      observations: [...area.observations].sort(
        (a, b) =>
          a.fromDate.localeCompare(b.fromDate) ||
          a.toDate.localeCompare(b.toDate) ||
          observationSegmentKey(a).localeCompare(observationSegmentKey(b)),
      ),
    }));
  expect(headlineSeries(ordered(ids[0])[0]?.observations ?? [])[0]?.dimensions).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'Sex', value: 'Female' })]),
  );
  const expected = pairedAreaValues(ordered(ids[0]), ordered(ids[1]));
  expect(expected.length).toBeGreaterThan(0);
  expect(await getCachedScatterAreas(db, ids, codes)).toBeUndefined();
  expect(await getIndicatorScatterData(db, ids, codes)).toEqual(expected);
});
