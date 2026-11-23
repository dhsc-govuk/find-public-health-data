import {
  headlineSeries,
  observationSegmentKey,
  pairedAreaSexValues,
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
import { getIndicatorSeriesData } from './indicator-series-repository.ts';
import {
  area,
  observation,
  observationSeries,
  observationSeriesBatch,
  publishedViews,
} from './schema/index.ts';
import { apiLogin, createTestDb, type TestDb } from './testing.ts';

const { indicator: publishedIndicator } = publishedViews;

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
  const data = await getIndicatorObservationData(db, publishedViews, ids, codes, 'table');
  return pairedAreaValues(data.get(ids[0])?.areaData ?? [], data.get(ids[1])?.areaData ?? []);
}

it('reads bounded cached candidates, markers and benchmarks in one statement', async () => {
  const expected = await canonical();
  expect(expected).toHaveLength(2);
  const query = vi.spyOn(db.$client, 'unsafe');
  try {
    const cached = await getCachedScatterAreas(db, publishedViews, ids, codes);
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

it('keeps sex variants when comparison caches offer only aggregate rows', async () => {
  const expected = (await canonical()).map((point) => ({
    ...point,
    x: point.y,
    y: point.x,
    xPeriod: point.yPeriod,
    yPeriod: point.xPeriod,
  }));
  const recent = await getIndicatorObservationData(db, publishedViews, ids, codes);
  const ranking = await getIndicatorSeriesData(db, publishedViews, ids, codes, 'ranking', true);
  const variants = pairedAreaSexValues(
    recent?.get(ids[1])?.areaData ?? [],
    recent?.get(ids[0])?.areaData ?? [],
  ).variants;
  const query = vi.spyOn(db.$client, 'unsafe');
  try {
    const comparison = await getPublishedIndicatorScatterData(
      db,
      publishedViews,
      [40501, 108],
      codes,
    );
    expect(comparison?.points).toEqual(expected);
    expect(comparison?.variants).toEqual(variants);
    expect(comparison?.variants.map(({ sex }) => sex)).toEqual(['Female', 'Male']);
    expect(comparison?.rankings).toEqual([
      ranking?.get(ids[1])?.areaData.map(({ populationKeys: _, ...area }) => area),
      ranking?.get(ids[0])?.areaData.map(({ populationKeys: _, ...area }) => area),
    ]);
  } finally {
    query.mockRestore();
  }
  expect(
    await getPublishedIndicatorScatterData(db, publishedViews, [108, 999999], codes),
  ).toBeUndefined();
});

it('keeps published scatter variants and rankings when a cached point is stale', async () => {
  const expected = await getPublishedIndicatorScatterData(db, publishedViews, [108, 40501], codes);
  await database.db
    .update(observationSeries)
    .set({ latestObservationId: '00000000-0000-0000-0000-000000000001' })
    .where(eq(observationSeries.indicatorId, ids[0]));
  const comparison = await getPublishedIndicatorScatterData(
    db,
    publishedViews,
    [108, 40501],
    codes,
  );
  expect(comparison?.points).toEqual(expected?.points);
  expect(comparison?.variants).toEqual(expected?.variants);
  expect(
    comparison?.rankings.map((areas) => areas.map(({ populationKeys: _, ...area }) => area)),
  ).toEqual(expected?.rankings.map((areas) => areas.map(({ populationKeys: _, ...area }) => area)));
});

it.each(['A"quote', 'A,comma', 'A{brace}', 'A\\slash'])(
  'binds area code %s as an array element and preserves requested order',
  async (code) => {
    await database.db
      .update(area)
      .set({ code })
      .where(eq(area.code, codes[0] ?? ''));
    const requested = [codes[1] ?? '', code];
    const data = await getIndicatorObservationData(db, publishedViews, ids, requested, 'table');
    const expected = pairedAreaValues(
      data.get(ids[0])?.areaData ?? [],
      data.get(ids[1])?.areaData ?? [],
    );
    expect(expected).toHaveLength(2);
    const query = vi.spyOn(db.$client, 'unsafe');
    try {
      const cached = await getCachedScatterAreas(db, publishedViews, ids, requested);
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

it('retains zeroes and each axis’s latest non-null published period', async () => {
  const original = await getCachedScatterAreas(db, publishedViews, ids, codes);
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
        point.yPeriod.toDate < latest.toDate ||
        (point.yPeriod.toDate === latest.toDate && point.yPeriod.fromDate < latest.fromDate),
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
        eq(observation.fromDate, common.xPeriod.fromDate),
        eq(observation.toDate, common.xPeriod.toDate),
      ),
    );
  const points = await getIndicatorScatterData(db, publishedViews, ids, codes);
  expect(points).toEqual(await canonical());
  expect(points.every((point) => point.x === 0)).toBe(true);
});

it.each([2022, 2024])('matches canonical annual histories ending in %i and 2018', async (end) => {
  const models = await database.db
    .selectDistinct({ id: observationSeries.indicatorId, batch: observationSeries.uploadBatchId })
    .from(observationSeries)
    .where(inArray(observationSeries.indicatorId, ids));
  const areas = await database.db.select().from(area).where(inArray(area.code, codes));
  await database.db.delete(observation).where(inArray(observation.indicatorId, ids));
  for (const model of models) {
    const lastYear = model.id === ids[0] ? end : 2018;
    await database.db.insert(observation).values(
      areas.flatMap((area) =>
        Array.from({ length: lastYear - 2014 }, (_, index) => ({
          indicatorId: model.id,
          uploadBatchId: model.batch,
          areaId: area.id,
          fromDate: `${2015 + index}-01-01`,
          toDate: `${2015 + index}-12-31`,
          dimensionKey: '',
          value: index + (area.code === 'E92000001' ? 100 : 1),
        })),
      ),
    );
    await database.db.transaction((tx) => replaceObservationSeries(tx, model.id, model.batch));
  }
  const history = await getIndicatorObservationData(db, publishedViews, ids, codes);
  const untrimmed = pairedAreaValues(
    history.get(ids[0])?.areaData ?? [],
    history.get(ids[1])?.areaData ?? [],
  );
  expect(untrimmed.map(({ code }) => code)).toEqual(codes.slice(0, 2));
  expect(
    untrimmed.every(
      ({ xPeriod, yPeriod }) =>
        xPeriod.toDate === `${end}-12-31` && yPeriod.toDate === '2018-12-31',
    ),
  ).toBe(true);
  const expected = await canonical();
  expect(expected).toEqual(untrimmed);
  const cached = await getCachedScatterAreas(db, publishedViews, ids, codes);
  expect(cached).toBeDefined();
  expect(pairedAreaValues(cached?.get(ids[0]) ?? [], cached?.get(ids[1]) ?? [])).toEqual(expected);
  expect(await getIndicatorScatterData(db, publishedViews, ids, codes)).toEqual(expected);
});

it('falls back for stale point IDs and missing batch markers', async () => {
  const expected = await canonical();
  await database.db
    .update(observationSeries)
    .set({
      recentObservationIds: sql`array_append(${observationSeries.recentObservationIds}, ${'00000000-0000-0000-0000-000000000001'}::uuid)`,
    })
    .where(eq(observationSeries.indicatorId, ids[0]));
  expect(await getCachedScatterAreas(db, publishedViews, ids, codes)).toBeUndefined();
  expect(await getIndicatorScatterData(db, publishedViews, ids, codes)).toEqual(expected);
  await database.db
    .delete(observationSeriesBatch)
    .where(eq(observationSeriesBatch.indicatorId, ids[1]));
  expect(await getCachedScatterAreas(db, publishedViews, ids, codes)).toBeUndefined();
  expect(await getIndicatorScatterData(db, publishedViews, ids, codes)).toEqual(expected);
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
  expect(await getCachedScatterAreas(db, publishedViews, ids, codes)).toBeUndefined();
  expect(await getIndicatorScatterData(db, publishedViews, ids, codes)).toEqual(await canonical());
});

it('uses canonical label ordering for tied sex headlines', async () => {
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
  const canonical = await getIndicatorObservationData(db, publishedViews, ids, codes, 'table');
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
  expect(await getCachedScatterAreas(db, publishedViews, ids, codes)).toBeDefined();
  expect(await getIndicatorScatterData(db, publishedViews, ids, codes)).toEqual(expected);
});

it('pairs the latest financial and three-year values independently for each area', async () => {
  const models = await database.db
    .selectDistinct({ id: observationSeries.indicatorId, batch: observationSeries.uploadBatchId })
    .from(observationSeries)
    .where(inArray(observationSeries.indicatorId, ids));
  const areas = await database.db.select().from(area).where(inArray(area.code, codes));
  await database.db.delete(observation).where(inArray(observation.indicatorId, ids));
  for (const model of models) {
    await database.db.insert(observation).values(
      areas.flatMap((area) => {
        const year = area.code === 'E92000001' ? 2023 : 2024;
        const financial = model.id === ids[0];
        const latest = {
          indicatorId: model.id,
          uploadBatchId: model.batch,
          areaId: area.id,
          dimensionKey: '',
          fromDate: financial ? `${year}-04-01` : `${year - 2}-01-01`,
          toDate: financial ? `${year + 1}-03-31` : `${year}-12-31`,
          value: financial ? 0 : 20,
        };
        return [
          { ...latest, fromDate: '2019-01-01', toDate: '2019-12-31', value: 5 },
          latest,
          { ...latest, fromDate: '2026-01-01', toDate: '2026-12-31', value: null },
        ];
      }),
    );
    await database.db.transaction((tx) => replaceObservationSeries(tx, model.id, model.batch));
  }
  const expected = [
    {
      code: codes[0],
      x: 0,
      y: 20,
      xPeriod: { fromDate: '2024-04-01', toDate: '2025-03-31' },
      yPeriod: { fromDate: '2022-01-01', toDate: '2024-12-31' },
    },
    {
      code: codes[1],
      x: 0,
      y: 20,
      xPeriod: { fromDate: '2023-04-01', toDate: '2024-03-31' },
      yPeriod: { fromDate: '2021-01-01', toDate: '2023-12-31' },
    },
  ];
  const cached = await getCachedScatterAreas(db, publishedViews, ids, codes);
  expect(cached).toBeDefined();
  expect(pairedAreaValues(cached?.get(ids[0]) ?? [], cached?.get(ids[1]) ?? [])).toMatchObject(
    expected,
  );
  expect(await canonical()).toMatchObject(expected);
  expect(await getIndicatorScatterData(db, publishedViews, ids, codes)).toMatchObject(expected);
  await database.db
    .delete(observationSeriesBatch)
    .where(eq(observationSeriesBatch.indicatorId, ids[1]));
  expect(await getCachedScatterAreas(db, publishedViews, ids, codes)).toBeUndefined();
  expect(await getIndicatorScatterData(db, publishedViews, ids, codes)).toMatchObject(expected);
});

it('keeps sex variants while older cache versions use canonical histories', async () => {
  const expected = await getPublishedIndicatorScatterData(db, publishedViews, [108, 40501], codes);
  await database.db
    .update(observationSeriesBatch)
    .set({ version: 0 })
    .where(inArray(observationSeriesBatch.indicatorId, ids));
  expect(await getCachedScatterAreas(db, publishedViews, ids, codes)).toBeUndefined();
  const actual = await getPublishedIndicatorScatterData(db, publishedViews, [108, 40501], codes);
  expect(actual?.points).toEqual(expected?.points);
  expect(actual?.variants).toEqual(expected?.variants);
  expect(actual?.variants.map(({ sex }) => sex)).toEqual(['Female', 'Male']);
});
