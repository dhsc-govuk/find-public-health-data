import {
  comparisonVariants,
  filterSeries,
  headlineSeries,
  observationSegmentKey,
  rankingAreaSeries,
  seriesPeriodTypes,
  tableAreaSeries,
  tableSummary,
} from '@fphd/utils/observation-series';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { replaceObservationSeries } from '../../internal-read-models/src/observation-series.ts';
import type { Database } from './client.ts';
import {
  getIndicatorObservationData,
  type IndicatorAreaData,
  type IndicatorObservation,
} from './indicator-observation-repository.ts';
import { getIndicatorSeriesData } from './indicator-series-repository.ts';
import { getIndicatorRankingData, getIndicatorTableData } from './indicator-table-repository.ts';
import { indicatorTrendDirections } from './indicator-trends.ts';
import {
  area,
  currentPublishedVersion,
  dimensionType,
  dimensionValue,
  indicatorVersion,
  observation,
  observationSeries,
  observationSeriesBatch,
  publishedArea,
  publishedViews,
  uploadBatch,
} from './schema/index.ts';
import { apiLogin, createTestDb, type TestDb } from './testing.ts';

const { indicator: publishedIndicator, observationSeries: publishedObservationSeries } =
  publishedViews;

let database: TestDb;
let db: Database;
let ids: string[];
beforeAll(async () => {
  database = await createTestDb({ template: 'seeded' });
  db = database.connectDb({ login: apiLogin('public_api') });
  ids = (await db.select({ id: publishedIndicator.id }).from(publishedIndicator)).map(
    ({ id }) => id,
  );
});

it('hydrates every area headline for aggregate comparisons alongside sexed-only areas', async () => {
  class RolledBack extends Error {}
  await expect(
    database.db.transaction(async (tx) => {
      const [model] = await tx.select().from(observationSeries).limit(1);
      const areas = await tx
        .select()
        .from(area)
        .where(inArray(area.code, ['E06000052', 'E92000001']));
      const [female] = await tx
        .select({ id: dimensionValue.id })
        .from(dimensionValue)
        .innerJoin(dimensionType, eq(dimensionType.id, dimensionValue.dimensionTypeId))
        .where(and(eq(dimensionType.name, 'Sex'), eq(dimensionValue.name, 'Female')));
      if (!model || !female || areas.length !== 2) throw new Error('Expected seeded fixtures');
      await tx.delete(observation).where(eq(observation.indicatorId, model.indicatorId));
      await tx.insert(observation).values(
        areas.map((a) => ({
          indicatorId: model.indicatorId,
          uploadBatchId: model.uploadBatchId,
          areaId: a.id,
          fromDate: '2024-01-01',
          toDate: '2024-12-31',
          dimensionKey: a.code === 'E92000001' ? '' : female.id,
          value: 10,
        })),
      );
      await replaceObservationSeries(tx, model.indicatorId, model.uploadBatchId, null);
      for (const mode of ['latest', 'recent', 'sparkline'] as const) {
        const cached = await getIndicatorSeriesData(
          tx,
          publishedViews,
          [model.indicatorId],
          ['E92000001', 'E06000052'],
          mode,
        );
        const aggregate = cached
          ?.get(model.indicatorId)
          ?.tableSeries?.find(({ sex, periodType }) => !sex && periodType === 'all');
        expect(aggregate?.segments).toEqual({
          E92000001: '|1-year',
          E06000052: 'Sex:Female|1-year',
        });
        expect(aggregate?.headlines).toEqual({ E92000001: true, E06000052: true });
        expect(aggregate?.rowOrder).toEqual({ E92000001: 0 });
      }
      throw new RolledBack();
    }),
  ).rejects.toBeInstanceOf(RolledBack);
});
afterAll(async () => {
  await database.drop();
});

it.each([[['E92000001']], [['E06000052', 'E92000001', 'E07000223', 'UNKNOWN']], [['UNKNOWN']]])(
  'matches history-based table cells, trends and rankings for %j',
  async (areas) => {
    const full = await getIndicatorObservationData(db, publishedViews, ids, areas);
    for (const mode of ['recent', 'latest', 'ranking', 'sparkline'] as const) {
      const cached = await getIndicatorSeriesData(db, publishedViews, ids, areas, mode);
      expect(cached).toBeDefined();
      for (const id of ids) {
        const history = full.get(id)?.areaData ?? [];
        const expected =
          mode === 'ranking'
            ? { areaData: rankingAreaSeries(history) }
            : tableSummary(tableAreaSeries(history), mode);
        const actual = cached?.get(id);
        const normaliseAreas = (areas: IndicatorAreaData[]) =>
          areas.map((area) => ({
            ...area,
            observations: [...area.observations].sort(
              (a, b) =>
                a.fromDate.localeCompare(b.fromDate) ||
                a.toDate.localeCompare(b.toDate) ||
                observationSegmentKey(a).localeCompare(observationSegmentKey(b)),
            ),
          }));
        expect(normaliseAreas(actual?.areaData ?? []), `${id} ${mode}`).toEqual(
          normaliseAreas(expected.areaData),
        );
        if ('tableSeries' in expected) {
          // Empty sex/period choices carry no cells and are omitted from the read model.
          const normalise = (choices: typeof expected.tableSeries) =>
            choices
              .filter(({ segments }) => Object.keys(segments).length)
              .sort((a, b) => `${a.sex}|${a.periodType}`.localeCompare(`${b.sex}|${b.periodType}`));
          expect(normalise(actual?.tableSeries ?? []), `${id} ${mode}`).toEqual(
            normalise(expected.tableSeries),
          );
        }
      }
    }
  },
);

it('includes all elected population keys without changing ranking values or SQL work', async () => {
  const codes = ['E06000052', 'E92000001'];
  const identities = await db
    .select()
    .from(publishedArea)
    .where(inArray(publishedArea.code, codes));
  const indicators = await db
    .select()
    .from(publishedIndicator)
    .where(inArray(publishedIndicator.shortId, [241, 92443]));
  const populations: Set<string>[] = [];
  for (const { id } of indicators) {
    const candidates = await db
      .select()
      .from(publishedObservationSeries)
      .where(eq(publishedObservationSeries.indicatorId, id));
    const query = vi.spyOn(db.$client, 'unsafe');
    try {
      const plain = await getIndicatorSeriesData(db, publishedViews, [id], codes, 'ranking');
      const statements = query.mock.calls.map(([text]) => text);
      query.mockClear();
      const ranked = await getIndicatorRankingData(db, publishedViews, id, codes);
      expect(query.mock.calls.map(([text]) => text)).toEqual(statements);
      expect(ranked.map(({ populationKeys: _, ...area }) => area)).toEqual(
        plain?.get(id)?.areaData,
      );
      for (const area of ranked) {
        const areaId = identities.find(({ code }) => code === area.areaCode)?.id;
        expect(area.populationKeys?.toSorted()).toEqual(
          [
            ...new Set(
              candidates.filter((row) => row.areaId === areaId).map((row) => row.dimensionKey),
            ),
          ].sort(),
        );
      }
      populations.push(new Set(ranked.flatMap(({ populationKeys }) => populationKeys ?? [])));
    } finally {
      query.mockRestore();
    }
  }
  expect(indicators).toHaveLength(2);
  expect([...(populations[0] ?? [])].some((key) => populations[1]?.has(key))).toBe(false);
});

it('retains eight periods of each offered variant without merging period lengths', async () => {
  const codes = ['E92000001'];
  const full = await getIndicatorObservationData(db, publishedViews, ids, codes);
  const mixed = [...full].find(([, entry]) => {
    const observations = entry.areaData[0]?.observations ?? [];
    return seriesPeriodTypes(observations).length > 1 && headlineSeries(observations).length >= 8;
  });
  if (!mixed) throw new Error('Expected seeded annual and rolling histories');
  const [id, entry] = mixed;
  const observations = entry.areaData[0]?.observations ?? [];
  const cached = await getIndicatorSeriesData(db, publishedViews, [id], codes, 'sparkline');
  const points = cached?.get(id)?.areaData[0]?.observations;
  for (const variant of comparisonVariants(observations)) {
    const series = headlineSeries(filterSeries(observations, variant));
    expect(points).toEqual(expect.arrayContaining(series.slice(-8)));
  }
});

it('falls back when a sparkline history point disappears before hydration', async () => {
  const [indicator] = await db
    .select({ id: publishedIndicator.id })
    .from(publishedIndicator)
    .where(eq(publishedIndicator.shortId, 241));
  if (!indicator) throw new Error('Expected diabetes seed data');
  const codes = ['E92000001'];
  const recent = await getIndicatorSeriesData(db, publishedViews, [indicator.id], codes, 'recent');
  const key = (point: IndicatorObservation) =>
    `${point.fromDate}:${point.toDate}:${observationSegmentKey(point)}`;
  const recentPoints = new Set(
    recent?.get(indicator.id)?.areaData.flatMap((area) => area.observations.map(key)),
  );
  let disappeared = false;
  const changing = new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'execute') return Reflect.get(target, property, receiver);
      return async (...args: Parameters<Database['execute']>) => {
        const points = await target.execute<{ id: string; point: IndicatorObservation }>(...args);
        const history = points.find(({ point }) => !recentPoints.has(key(point)));
        if (!history) throw new Error('Expected history beyond the five recent points');
        disappeared = true;
        return points.filter(({ id }) => id !== history.id);
      };
    },
  });
  expect(
    await getIndicatorSeriesData(changing, publishedViews, [indicator.id], codes, 'sparkline'),
  ).toBeUndefined();
  expect(disappeared).toBe(true);
});

it('uses canonical eight-period history until the new cache column has been rebuilt', async () => {
  const id = ids[0];
  if (!id) throw new Error('Expected seed data');
  const [identity] = await db
    .select({ shortId: publishedIndicator.shortId })
    .from(publishedIndicator)
    .where(eq(publishedIndicator.id, id));
  if (!identity) throw new Error('Expected a published identity');
  const codes = ['E92000001'];
  const expected = await getIndicatorTableData(
    db,
    publishedViews,
    [identity.shortId],
    codes,
    'sparkline',
  );
  await database.db
    .update(observationSeries)
    .set({ sparklineObservationIds: null })
    .where(eq(observationSeries.indicatorId, id));
  expect(
    await getIndicatorSeriesData(db, publishedViews, [id], codes, 'sparkline'),
  ).toBeUndefined();
  const actual = await getIndicatorTableData(
    db,
    publishedViews,
    [identity.shortId],
    codes,
    'sparkline',
  );
  const normalise = (entries: typeof expected) =>
    entries.map(({ tableSeries, areaData, ...entry }) => ({
      ...entry,
      areaData: areaData.map((area) => ({
        ...area,
        observations: [...area.observations].sort(
          (a, b) =>
            a.fromDate.localeCompare(b.fromDate) ||
            a.toDate.localeCompare(b.toDate) ||
            observationSegmentKey(a).localeCompare(observationSegmentKey(b)),
        ),
      })),
      tableSeries: tableSeries
        ?.filter(({ segments }) => Object.keys(segments).length)
        .sort((a, b) => `${a.sex}|${a.periodType}`.localeCompare(`${b.sex}|${b.periodType}`)),
    }));
  expect(normalise(actual)).toEqual(normalise(expected));
});

it('uses canonical data when the published batch has no completed read model', async () => {
  const id = ids[0];
  if (!id) throw new Error('Expected seed data');
  const areas = ['E92000001'];
  await database.sql`delete from observation_series_batch where indicator_id = ${id}`;
  expect(await getIndicatorSeriesData(db, publishedViews, [id], areas, 'latest')).toBeUndefined();
  const [identity] = await database.sql<
    { shortId: number }[]
  >`select short_id as "shortId" from indicator where id = ${id}`;
  for (const mode of ['latest', 'sparkline'] as const) {
    const full = await getIndicatorObservationData(
      db,
      publishedViews,
      [id],
      areas,
      mode === 'latest' ? 'summary' : mode,
    );
    const [result] = await getIndicatorTableData(
      db,
      publishedViews,
      [identity?.shortId ?? 0],
      areas,
      mode,
    );
    expect(result?.areaData).toEqual(full.get(id)?.areaData);
  }
});

it('matches canonical topic trends when published-batch trend inputs are available', async () => {
  const cached = await indicatorTrendDirections(db, publishedViews, ids);
  await database.sql`update observation_series_batch set trend_values = null`;
  expect(await indicatorTrendDirections(db, publishedViews, ids)).toEqual(cached);
});

it.each(['latest', 'recent', 'ranking', 'sparkline'] as const)(
  'uses canonical reads if publication changes while fetching cached %s points',
  async (mode) => {
    const id = ids[1 + ['latest', 'recent', 'ranking', 'sparkline'].indexOf(mode)];
    if (!id) throw new Error('Expected a seeded indicator');
    let switched = false;
    const changing = new Proxy(db, {
      get(target, property, receiver) {
        if (property !== 'execute') return Reflect.get(target, property, receiver);
        return async (...args: Parameters<Database['execute']>) => {
          if (!switched) {
            switched = true;
            await publishNextBatch(id);
          }
          return target.execute(...args);
        };
      },
    });
    expect(
      await getIndicatorSeriesData(changing, publishedViews, [id], ['E92000001'], mode),
    ).toBeUndefined();
    expect(switched).toBe(true);
    const [identity] = await database.sql<{ shortId: number }[]>`
      select short_id as "shortId" from indicator where id = ${id}`;
    const [loaded] = await getIndicatorTableData(
      db,
      publishedViews,
      [identity?.shortId ?? 0],
      ['E92000001'],
      'latest',
    );
    expect(loaded?.areaData[0]?.observations).toMatchObject([
      { value: 123, fromDate: '2099-01-01' },
    ]);
  },
);

it('keeps selected values and older England benchmarks in one publication snapshot', async () => {
  // Every seeded local headline ends with England's, so England gets one later period.
  const [benchmark] = await database.sql<{ id: string }[]>`
    select b.id
    from published.observation_series l join area a on a.id = l.area_id
    join observation p on p.id = l.latest_observation_id
    join area england on england.code = 'E92000001'
    join published.observation b on b.indicator_id = l.indicator_id and b.area_id = england.id
      and b.dimension_key = l.dimension_key and b.from_date = p.from_date and b.to_date = p.to_date
    where a.code <> 'E92000001' and l.indicator_id <> ${ids[0] ?? ''}::uuid
    limit 1
  `;
  if (!benchmark) throw new Error('Expected a local period with an England benchmark');
  const [later] = await database.sql<{ id: string }[]>`
    insert into observation
      (indicator_id, area_id, from_date, to_date, value, upload_batch_id, dimension_key)
    select indicator_id, area_id, from_date + interval '1 year', to_date + interval '1 year',
      value, upload_batch_id, dimension_key
    from observation where id = ${benchmark.id}
    returning id
  `;
  await database.sql`
    update observation_series set latest_observation_id = ${later?.id ?? null}
    where latest_observation_id = ${benchmark.id}
  `;
  const [candidate] = await database.sql<{ id: string; code: string }[]>`
    select l.indicator_id as id, a.code
    from published.observation_series l join area a on a.id = l.area_id
    join observation p on p.id = l.latest_observation_id
    join area england on england.code = 'E92000001'
    join published.observation b on b.indicator_id = l.indicator_id and b.area_id = england.id
      and b.dimension_key = l.dimension_key and b.from_date = p.from_date and b.to_date = p.to_date
    where a.code <> 'E92000001' and l.indicator_id <> ${ids[0] ?? ''}::uuid
      and not exists (select 1 from published.observation_series e
        where e.indicator_id = l.indicator_id and e.area_id = england.id
          and e.latest_observation_id = b.id)
    limit 1
  `;
  if (!candidate) throw new Error('Expected a local period preceding the England headline');
  const codes = [candidate.code, 'E92000001'];
  const expected = await getIndicatorSeriesData(
    db,
    publishedViews,
    [candidate.id],
    codes,
    'latest',
  );
  expect(expected).toBeDefined();
  let switched = false;
  const changing = new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'execute') return Reflect.get(target, property, receiver);
      return async (...args: Parameters<Database['execute']>) => {
        const rows = await target.execute(...args);
        if (!switched) {
          switched = true;
          await publishNextBatch(candidate.id);
        }
        return rows;
      };
    },
  });
  expect(
    await getIndicatorSeriesData(changing, publishedViews, [candidate.id], codes, 'latest'),
  ).toEqual(expected);
  expect(switched).toBe(true);
});

it('uses canonical history when one code identifies multiple historical areas', async () => {
  const id = ids[4];
  if (!id) throw new Error('Expected a seeded indicator');
  const [original] = await database.db.select().from(area).where(eq(area.code, 'E06000052'));
  if (!original) throw new Error('Expected a local area');
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
    name: 'Current Cornwall',
  });
  expect(
    await getIndicatorSeriesData(db, publishedViews, [id], [original.code], 'latest'),
  ).toBeUndefined();
  const [identity] = await database.sql<{ shortId: number }[]>`
    select short_id as "shortId" from indicator where id = ${id}`;
  const expected = await getIndicatorObservationData(
    db,
    publishedViews,
    [id],
    [original.code],
    'summary',
  );
  const [actual] = await getIndicatorTableData(
    db,
    publishedViews,
    [identity?.shortId ?? 0],
    [original.code],
    'latest',
  );
  expect(actual?.areaData).toEqual(expected.get(id)?.areaData);
});

async function publishNextBatch(id: string) {
  const [previous] = await database.db
    .select()
    .from(indicatorVersion)
    .where(eq(indicatorVersion.indicatorId, id))
    .limit(1);
  const [england] = await database.db.select().from(area).where(eq(area.code, 'E92000001'));
  if (!previous || !england) throw new Error('Expected published fixtures');
  const [version] = await database.db
    .insert(indicatorVersion)
    .values({
      ...previous,
      id: undefined,
      uploadBatchId: null,
      dataTableConfirmedAt: null,
      publishedAt: new Date('2099-01-01T00:00:00Z'),
    })
    .returning();
  if (!version) throw new Error('Expected a new publication');
  const [batch] = await database.db
    .insert(uploadBatch)
    .values({
      indicatorId: id,
      indicatorVersionId: version.id,
      originalFilename: 'new-publication.csv',
      uploadedBy: previous.createdBy,
    })
    .returning();
  if (!batch) throw new Error('Expected a new batch');
  await database.db
    .update(indicatorVersion)
    .set({ uploadBatchId: batch.id })
    .where(eq(indicatorVersion.id, version.id));
  await database.db.insert(observation).values({
    indicatorId: id,
    areaId: england.id,
    uploadBatchId: batch.id,
    dimensionKey: '',
    fromDate: '2099-01-01',
    toDate: '2099-12-31',
    value: 123,
  });
}

it('uses canonical comparisons and trends for caches written by an older series algorithm', async () => {
  const id = ids[6];
  if (!id) throw new Error('Expected a seeded indicator');
  const [identity] = await db
    .select({ shortId: publishedIndicator.shortId })
    .from(publishedIndicator)
    .where(eq(publishedIndicator.id, id));
  const [batch] = await database.db
    .select()
    .from(observationSeriesBatch)
    .where(eq(observationSeriesBatch.indicatorId, id));
  const original = await database.db
    .select()
    .from(observationSeries)
    .where(eq(observationSeries.indicatorId, id));
  if (!identity || !batch) throw new Error('Expected a completed read model');
  const codes = ['E92000001'];
  const expectedTrend = await indicatorTrendDirections(db, publishedViews, [id]);
  const expected = new Map(
    await Promise.all(
      (['latest', 'recent', 'sparkline'] as const).map(
        async (mode) =>
          [
            mode,
            await getIndicatorTableData(db, publishedViews, [identity.shortId], codes, mode),
          ] as const,
      ),
    ),
  );
  const expectedRanking = await getIndicatorRankingData(db, publishedViews, id, codes);
  try {
    await database.db
      .update(observationSeriesBatch)
      .set({ version: 0, trendValues: [1, 2, 3, 4, 5] })
      .where(eq(observationSeriesBatch.indicatorId, id));
    await database.sql`update observation_series set period_type = 'annual',
      variants = '[{"sex":"","periodType":"annual"}]'::jsonb
      where indicator_id = ${id} and period_type = 'all'`;
    const normalise = (entries: Awaited<ReturnType<typeof getIndicatorTableData>>) =>
      entries.map((entry) => ({
        ...entry,
        tableSeries: entry.tableSeries
          ?.filter(({ segments }) => Object.keys(segments).length)
          .sort((a, b) => `${a.sex}|${a.periodType}`.localeCompare(`${b.sex}|${b.periodType}`)),
        areaData: entry.areaData.map((area) => ({
          ...area,
          observations: [...area.observations].sort(
            (a, b) =>
              a.fromDate.localeCompare(b.fromDate) ||
              a.toDate.localeCompare(b.toDate) ||
              observationSegmentKey(a).localeCompare(observationSegmentKey(b)),
          ),
        })),
      }));
    for (const mode of ['latest', 'recent', 'sparkline'] as const) {
      expect(await getIndicatorSeriesData(db, publishedViews, [id], codes, mode)).toBeUndefined();
      expect(
        normalise(await getIndicatorTableData(db, publishedViews, [identity.shortId], codes, mode)),
      ).toEqual(normalise(expected.get(mode) ?? []));
    }
    expect(
      await getIndicatorSeriesData(db, publishedViews, [id], codes, 'ranking'),
    ).toBeUndefined();
    expect(await getIndicatorRankingData(db, publishedViews, id, codes)).toEqual(
      expectedRanking.map(({ populationKeys: _, ...area }) => area),
    );
    expect(await indicatorTrendDirections(db, publishedViews, [id])).toEqual(expectedTrend);
  } finally {
    await database.db.delete(observationSeries).where(eq(observationSeries.indicatorId, id));
    if (original.length) await database.db.insert(observationSeries).values(original);
    await database.db
      .update(observationSeriesBatch)
      .set(batch)
      .where(eq(observationSeriesBatch.indicatorId, id));
  }
});

it('keeps imported annual and historical rows while cached and full reads select all current cumulative quarters', async () => {
  class RolledBack extends Error {}
  await expect(
    database.db.transaction(async (tx) => {
      const [model] = await tx
        .select({
          indicatorId: currentPublishedVersion.indicatorId,
          uploadBatchId: indicatorVersion.uploadBatchId,
        })
        .from(currentPublishedVersion)
        .innerJoin(indicatorVersion, eq(indicatorVersion.id, currentPublishedVersion.id))
        .where(isNotNull(indicatorVersion.uploadBatchId))
        .limit(1);
      const [england] = await tx.select().from(area).where(eq(area.code, 'E92000001'));
      if (!model?.uploadBatchId || !england) throw new Error('Missing seeded series fixtures');
      const common = {
        indicatorId: model.indicatorId,
        uploadBatchId: model.uploadBatchId,
        areaId: england.id,
        dimensionKey: '',
      };
      const cumulative = Array.from({ length: 17 }, (_, index) => ({
        ...common,
        fromDate: '2090-04-01',
        toDate: new Date(Date.UTC(2090, 6 + index * 3, 0)).toISOString().slice(0, 10),
        periodType: 'cumulative-quarter-2090-04-01' as const,
        value: index + 1,
      }));
      await tx.insert(observation).values([
        ...cumulative,
        { ...common, fromDate: '2090-04-01', toDate: '2091-03-31', value: 99 },
        {
          ...common,
          fromDate: '2089-04-01',
          toDate: '2094-03-31',
          periodType: 'cumulative-quarter-2089-04-01',
          value: 80,
        },
      ]);
      await replaceObservationSeries(tx, model.indicatorId, model.uploadBatchId, null);
      const full = await getIndicatorObservationData(
        tx,
        publishedViews,
        [model.indicatorId],
        ['E92000001'],
      );
      const points = full.get(model.indicatorId)?.areaData[0]?.observations ?? [];
      expect(
        points.filter(({ fromDate }) => fromDate === '2089-04-01' || fromDate === '2090-04-01'),
      ).toHaveLength(19);
      expect(headlineSeries(points).map(({ value }) => value)).toEqual(
        cumulative.map(({ value }) => value),
      );
      expect(await indicatorTrendDirections(tx, publishedViews, [model.indicatorId])).toEqual(
        new Map([[model.indicatorId, 'up']]),
      );
      const cached = await getIndicatorSeriesData(
        tx,
        publishedViews,
        [model.indicatorId],
        ['E92000001'],
        'recent',
      );
      const result = cached?.get(model.indicatorId);
      expect(result?.areaData[0]?.observations.map(({ value }) => value)).toEqual([
        13, 14, 15, 16, 17,
      ]);
      expect(
        result?.areaData[0]?.observations.every(
          ({ periodType }) => periodType === 'cumulative-quarter-2090-04-01',
        ),
      ).toBe(true);
      expect(result?.tableSeries?.map(({ periodType }) => periodType)).toEqual(['all']);
      await tx
        .delete(observationSeriesBatch)
        .where(eq(observationSeriesBatch.indicatorId, model.indicatorId));
      expect(await indicatorTrendDirections(tx, publishedViews, [model.indicatorId])).toEqual(
        new Map([[model.indicatorId, 'up']]),
      );
      throw new RolledBack();
    }),
  ).rejects.toBeInstanceOf(RolledBack);
});
