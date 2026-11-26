import {
  headlineSeries,
  OBSERVATION_SERIES_VERSION,
  observationPeriodType,
  periodTypeLength,
  seriesPeriodTypes,
  seriesTrend,
} from '@fphd/utils/observation-series';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { replaceObservationSeries } from '../../internal-read-models/src/observation-series.ts';
import publishedTrends from '../../utils/src/fixtures/fingertips-recent-trends.json' with {
  type: 'json',
};
import type { Database } from './client.ts';
import { dimensionKey } from './dimension-key.ts';
import { getIndicatorObservationData } from './indicator-observation-repository.ts';
import { searchIndicators } from './indicator-repository.ts';
import { getIndicatorSeriesData } from './indicator-series-repository.ts';
import { indicatorTrendDirections, indicatorTrendSummaries } from './indicator-trends.ts';
import { observationPeriodSql, periodLengthSql } from './observation-series-sql.ts';
import {
  area,
  areaType,
  dimensionType,
  dimensionValue,
  dimensionValueAgeRange,
  IMPORTED_INDICATOR_TEAM_ID,
  indicator,
  indicatorVersion,
  indicatorVersionTopic,
  observation,
  observationDimension,
  observationSeriesBatch,
  publishedViews,
  SYSTEM_USER_IDS,
  topic,
  uploadBatch,
  valueType,
} from './schema/index.ts';
import { apiLogin, createTestDb, type TestDb } from './testing.ts';
import { getTopicTrendSummary } from './topic-repository.ts';

const WEST_SUSSEX = 'E10000032';
const CORNWALL = 'E06000052';

let database: TestDb;
let publicDb: Database;
let englandId: string;
let westSussexId: string;
let cornwallId: string;
let proportionId: string;
let dimensions: (typeof dimensionValue.$inferSelect)[];

beforeAll(async () => {
  database = await createTestDb();
  const [proportion] = await database.db
    .select()
    .from(valueType)
    .where(eq(valueType.name, 'Proportion'));
  if (!proportion) throw new Error('Value type fixture missing');
  proportionId = proportion.id;
  publicDb = database.connectDb({ login: apiLogin('public_api') });
  const [type] = await database.db
    .insert(areaType)
    .values({ name: 'England', hierarchyType: 'Administrative' })
    .returning();
  if (!type) throw new Error('England type fixture missing');
  const [england] = await database.db
    .insert(area)
    .values({ code: 'E92000001', name: 'England', areaTypeId: type.id })
    .returning();
  if (!england) throw new Error('England fixture missing');
  englandId = england.id;
  const [westSussex] = await database.db
    .insert(area)
    .values({ code: WEST_SUSSEX, name: 'West Sussex', areaTypeId: type.id })
    .returning();
  if (!westSussex) throw new Error('West Sussex fixture missing');
  westSussexId = westSussex.id;
  const [cornwall] = await database.db
    .insert(area)
    .values({ code: CORNWALL, name: 'Cornwall', areaTypeId: type.id })
    .returning();
  if (!cornwall) throw new Error('Cornwall fixture missing');
  cornwallId = cornwall.id;
  const types = await database.db
    .insert(dimensionType)
    .values([
      { name: 'Sex', dimensionClass: 'core' },
      { name: 'Age', dimensionClass: 'core' },
    ])
    .returning();
  dimensions = await database.db
    .insert(dimensionValue)
    .values(types.map((type) => ({ dimensionTypeId: type.id, name: type.name })))
    .returning();
});

afterAll(async () => {
  await database.drop();
});

/** A published indicator with no cached trend values, so every lookup reads its observations. */
async function publishedIndicator(
  name: string,
  polarity: 'higher-is-better' | 'lower-is-better' | 'no-comparison-possible' = 'higher-is-better',
) {
  const db = database.db;
  const [identity] = await db
    .insert(indicator)
    .values({ teamId: IMPORTED_INDICATOR_TEAM_ID })
    .returning();
  if (!identity) throw new Error('Indicator fixture missing');
  const [version] = await db
    .insert(indicatorVersion)
    .values({
      indicatorId: identity.id,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      polarity,
      valueTypeId: proportionId,
      status: 'published',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      createdBy: SYSTEM_USER_IDS.pholioMigration,
      updatedBy: SYSTEM_USER_IDS.pholioMigration,
    })
    .returning();
  if (!version) throw new Error('Version fixture missing');
  const [batch] = await db
    .insert(uploadBatch)
    .values({
      indicatorId: identity.id,
      indicatorVersionId: version.id,
      originalFilename: 'trend.csv',
      uploadedBy: SYSTEM_USER_IDS.pholioMigration,
      status: 'processed',
    })
    .returning();
  if (!batch) throw new Error('Batch fixture missing');
  await db
    .update(indicatorVersion)
    .set({ uploadBatchId: batch.id })
    .where(eq(indicatorVersion.id, version.id));
  return { id: identity.id, versionId: version.id, batchId: batch.id, slug: version.slug };
}

/** Adds a series of yearly values ending in 2019, so series of any length end together. */
async function addSeries(
  fixture: { id: string; batchId: string },
  areaId: string,
  values: (number | null)[],
  seriesDimensions: (typeof dimensionValue.$inferSelect)[] = [],
  years = 1,
) {
  const rows = await database.db
    .insert(observation)
    .values(
      values.map((value, index) => ({
        indicatorId: fixture.id,
        areaId,
        fromDate: `${2021 - values.length + index - years}-01-01`,
        toDate: `${2020 - values.length + index}-12-31`,
        value,
        count: value === null ? null : value * 100,
        denominator: 10000,
        lowerCi95: value === null ? null : value - 0.5,
        upperCi95: value === null ? null : value + 0.5,
        dimensionKey: dimensionKey(seriesDimensions.map(({ id }) => id)),
        uploadBatchId: fixture.batchId,
      })),
    )
    .returning();
  if (seriesDimensions.length > 0) {
    await database.db.insert(observationDimension).values(
      rows.flatMap((row) =>
        seriesDimensions.map((dimension) => ({
          observationId: row.id,
          dimensionValueId: dimension.id,
          dimensionTypeId: dimension.dimensionTypeId,
        })),
      ),
    );
  }
}

it('leaves a 94184-style proportion with values and CIs but no counts or denominators uncalculated', async () => {
  const fixture = await publishedIndicator('Fingertips 94184 style');
  await addSeries(fixture, englandId, [10, 12, 14, 16, 18]);
  const rows = await database.db
    .update(observation)
    .set({ count: null, denominator: null })
    .where(eq(observation.indicatorId, fixture.id))
    .returning();
  expect(rows).toHaveLength(5);
  expect(
    rows.every((row) => row.value !== null && row.lowerCi95 !== null && row.upperCi95 !== null),
  ).toBe(true);
  expect(await indicatorTrendDirections(publicDb, publishedViews, [fixture.id])).toEqual(
    new Map([[fixture.id, null]]),
  );
});

it.each(publishedTrends.samples)(
  '$key preserves the published marker through SQL, fallback and cached reads',
  async (sample) => {
    const fixture = await publishedIndicator(`Published trend ${sample.key}`);
    const types = await database.db.select().from(valueType);
    const type = types.find(({ name }) => name.toLowerCase() === sample.valueType.toLowerCase());
    if (!type) throw new Error(`Value type fixture missing: ${sample.valueType}`);
    await database.db
      .update(indicatorVersion)
      .set({ valueTypeId: type.id })
      .where(eq(indicatorVersion.id, fixture.versionId));
    await database.db.insert(observation).values(
      sample.observations.flatMap((point) =>
        [englandId, westSussexId].map((areaId) => ({
          ...point,
          indicatorId: fixture.id,
          uploadBatchId: fixture.batchId,
          areaId,
          dimensionKey: '',
        })),
      ),
    );
    const expected = [null, 'up', 'down', 'right'][sample.marker.Marker];
    const codes = ['E92000001', WEST_SUSSEX];
    const assertDirections = async () => {
      for (const code of codes)
        expect(
          await indicatorTrendDirections(publicDb, publishedViews, [fixture.id], code),
        ).toEqual(new Map([[fixture.id, expected]]));
    };
    await assertDirections();
    for (const projection of ['table', 'summary', 'sparkline'] as const) {
      const full = (
        await getIndicatorObservationData(publicDb, publishedViews, [fixture.id], codes, projection)
      ).get(fixture.id);
      expect(full?.tableSeries?.[0]?.trends).toEqual({
        E92000001: expected,
        [WEST_SUSSEX]: expected,
      });
    }
    await database.db.transaction((tx) =>
      replaceObservationSeries(tx, fixture.id, fixture.batchId, null),
    );
    await assertDirections();
    for (const mode of ['recent', 'latest', 'sparkline'] as const) {
      const cached = (
        await getIndicatorSeriesData(publicDb, publishedViews, [fixture.id], codes, mode)
      )?.get(fixture.id);
      expect(cached?.tableSeries?.[0]?.trends).toEqual({
        E92000001: expected,
        [WEST_SUSSEX]: expected,
      });
    }
  },
);

it.each([0, 1])(
  'prefers a series with %i dimensions over a longer, more disaggregated series as public_api',
  async (dimensionCount) => {
    const fixture = await publishedIndicator(`Trend fixture ${dimensionCount}`);
    await addSeries(fixture, englandId, [1, 2, 3, 4, 5], dimensions.slice(0, dimensionCount));
    await addSeries(fixture, englandId, [7, 6, 5, 4, 3, 2, 1], dimensions);
    expect(await indicatorTrendDirections(publicDb, publishedViews, [fixture.id])).toEqual(
      new Map([[fixture.id, 'up']]),
    );
  },
);

it('prefers the widest age over a band in it with more points', async () => {
  const age = dimensions.find(({ name }) => name === 'Age');
  if (!age) throw new Error('Age fixture missing');
  const bands = await database.db
    .insert(dimensionValue)
    .values([
      { dimensionTypeId: age.dimensionTypeId, name: '18-74 yrs' },
      { dimensionTypeId: age.dimensionTypeId, name: '70-74 yrs' },
    ])
    .returning();
  const [whole, band] = bands;
  if (!whole || !band) throw new Error('Age band fixtures missing');
  await database.db.insert(dimensionValueAgeRange).values([
    {
      id: whole.id,
      ageFromValue: 18,
      ageFromUnit: 'year',
      ageUnderValue: 75,
      ageUnderUnit: 'year',
    },
    {
      id: band.id,
      ageFromValue: 70,
      ageFromUnit: 'year',
      ageUnderValue: 75,
      ageUnderUnit: 'year',
    },
  ]);
  const fixture = await publishedIndicator('Age trend fixture');
  await addSeries(fixture, englandId, [1, 2, 3, 4, 5], [whole]);
  await addSeries(fixture, englandId, [7, 6, 5, 4, 3, 2, 1], [band]);
  expect(await indicatorTrendDirections(publicDb, publishedViews, [fixture.id])).toEqual(
    new Map([[fixture.id, 'up']]),
  );
});

it("works out the trend of the same series choice for another area, ignoring England's cache", async () => {
  const fixture = await publishedIndicator('Area trend fixture');
  await addSeries(fixture, englandId, [1, 2, 3, 4, 5]);
  // England's cached summary describes a falling trend.
  await database.db.insert(observationSeriesBatch).values({
    uploadBatchId: fixture.batchId,
    indicatorId: fixture.id,
    trend: seriesTrend(
      [5, 4, 3, 2, 1].map((value, index) => ({
        fromDate: `${2015 + index}-01-01`,
        toDate: `${2015 + index}-12-31`,
        value,
        count: value * 100,
        denominator: 10000,
        lowerCi95: value - 0.5,
        upperCi95: value + 0.5,
      })),
    ),
    version: OBSERVATION_SERIES_VERSION,
  });
  await addSeries(fixture, westSussexId, [1, 2, 3, 4, 5]);
  await addSeries(fixture, westSussexId, [9, 8, 7, 6, 5, 4, 3], dimensions);
  const other = await publishedIndicator('England only trend fixture');
  await addSeries(other, englandId, [1, 2, 3, 4, 5]);
  const suppressed = await publishedIndicator('Suppressed area trend fixture');
  await addSeries(suppressed, englandId, [1, 2, 3, 4, 5]);
  await addSeries(suppressed, westSussexId, [null, null, null, null, null]);
  const plainSuppressed = await publishedIndicator('Plain suppressed area trend fixture');
  await addSeries(plainSuppressed, westSussexId, [null, null, null, null, null]);
  await addSeries(plainSuppressed, westSussexId, [1, 2, 3, 4, 5], dimensions);
  const ids = [fixture.id, other.id, suppressed.id, plainSuppressed.id];

  expect(await indicatorTrendDirections(publicDb, publishedViews, [fixture.id])).toEqual(
    new Map([[fixture.id, 'down']]),
  );
  expect(await indicatorTrendDirections(publicDb, publishedViews, ids, WEST_SUSSEX)).toEqual(
    new Map([
      [fixture.id, 'up'],
      [plainSuppressed.id, null],
    ]),
  );
});

describe('getTopicTrendSummary', () => {
  it('counts only the indicators with a value for a chosen area, and every indicator for England', async () => {
    const [record] = await database.db
      .insert(topic)
      .values({
        slug: 'trend-summary-topic',
        title: 'Trend summary topic',
        description: 'Trend summary fixture.',
        createdBy: SYSTEM_USER_IDS.testSeed,
        updatedBy: SYSTEM_USER_IDS.testSeed,
      })
      .returning();
    if (!record) throw new Error('Topic fixture missing');
    const improving = await publishedIndicator('Summary improving', 'lower-is-better');
    await addSeries(improving, englandId, [5, 4, 3, 2, 1]);
    await addSeries(improving, westSussexId, [1, 2, 3, 4, 5]);
    const short = await publishedIndicator('Summary short');
    await addSeries(short, englandId, [1, 2, 3, 4, 5]);
    await addSeries(short, westSussexId, [1, 2, null, 4]);
    const englandOnly = await publishedIndicator('Summary England only');
    await addSeries(englandOnly, englandId, [1, 2, 3, 4, 5]);
    const noData = await publishedIndicator('Summary no data');
    const suppressed = await publishedIndicator('Summary suppressed');
    await addSeries(suppressed, englandId, [1, 2, 3, 4, 5]);
    await addSeries(suppressed, westSussexId, [null, null, null, null, null]);
    await addSeries(suppressed, cornwallId, [null, null, null, null, null]);
    await database.db.insert(indicatorVersionTopic).values(
      [improving, short, englandOnly, noData, suppressed].map(({ versionId }) => ({
        topicId: record.id,
        indicatorVersionId: versionId,
      })),
    );
    const empty = { better: 0, worse: 0, unchanged: 0, increasing: 0, decreasing: 0 };

    expect(await getTopicTrendSummary(publicDb, publishedViews, 'trend-summary-topic')).toEqual({
      ...empty,
      total: 5,
      better: 4,
      unavailable: 1,
    });
    expect(
      await getTopicTrendSummary(publicDb, publishedViews, 'trend-summary-topic', WEST_SUSSEX),
    ).toEqual({ ...empty, total: 2, worse: 1, unavailable: 1 });
    expect(
      await getTopicTrendSummary(publicDb, publishedViews, 'trend-summary-topic', CORNWALL),
    ).toEqual({ ...empty, total: 0, unavailable: 0 });
  });
});

it('keeps cumulative trends unavailable in topic counts and search with missing, current and version 8 caches', async () => {
  const [record] = await database.db
    .insert(topic)
    .values({
      slug: 'cumulative-trend-eligibility',
      title: 'Cumulative trend eligibility',
      description: 'Cumulative trend eligibility fixture.',
      createdBy: SYSTEM_USER_IDS.testSeed,
      updatedBy: SYSTEM_USER_IDS.testSeed,
    })
    .returning();
  if (!record) throw new Error('Topic fixture missing');
  const cumulative = await publishedIndicator('Cumulative eligibility A cumulative');
  const improving = await publishedIndicator('Cumulative eligibility B improving');
  const worsening = await publishedIndicator('Cumulative eligibility C worsening');
  const fixtures = [cumulative, improving, worsening];
  await database.db.insert(indicatorVersionTopic).values(
    fixtures.map(({ versionId }) => ({
      topicId: record.id,
      indicatorVersionId: versionId,
    })),
  );
  for (const areaId of [englandId, westSussexId]) {
    await addSeries(cumulative, areaId, [5, 4, 3, 2, 1]);
    await addSeries(improving, areaId, [1, 2, 3, 4, 5]);
    await addSeries(worsening, areaId, [5, 4, 3, 2, 1]);
  }
  await database.db.insert(observation).values(
    [englandId, westSussexId, cornwallId].flatMap((areaId) =>
      Array.from({ length: 5 }, (_, index) => ({
        indicatorId: cumulative.id,
        uploadBatchId: cumulative.batchId,
        areaId,
        dimensionKey: '',
        fromDate: '2022-04-01',
        toDate: new Date(Date.UTC(2022, 6 + index * 3, 0)).toISOString().slice(0, 10),
        periodType: 'cumulative-quarter-2022-04-01' as const,
        value: areaId === cornwallId ? null : index + 1,
      })),
    ),
  );

  for (const cache of ['missing', 'current', 'version-8']) {
    if (cache === 'current') {
      for (const fixture of fixtures)
        await replaceObservationSeries(database.db, fixture.id, fixture.batchId, null);
      const [batch] = await database.db
        .select()
        .from(observationSeriesBatch)
        .where(eq(observationSeriesBatch.indicatorId, cumulative.id));
      expect.soft(batch?.trend?.annual).toBe(false);
    }
    if (cache === 'version-8')
      await database.db
        .update(observationSeriesBatch)
        .set({
          version: 8,
          trend: seriesTrend(
            [5, 4, 3, 2, 1].map((value, index) => ({
              fromDate: `${2015 + index}-01-01`,
              toDate: `${2015 + index}-12-31`,
              value,
              count: value * 100,
              denominator: 10000,
              lowerCi95: value - 0.5,
              upperCi95: value + 0.5,
            })),
          ),
        })
        .where(eq(observationSeriesBatch.indicatorId, cumulative.id));

    for (const code of ['E92000001', WEST_SUSSEX]) {
      expect
        .soft(await indicatorTrendDirections(publicDb, publishedViews, [cumulative.id], code))
        .toEqual(new Map([[cumulative.id, null]]));
      expect.soft(await getTopicTrendSummary(publicDb, publishedViews, record.slug, code)).toEqual({
        total: 3,
        better: 1,
        worse: 1,
        unchanged: 0,
        increasing: 0,
        decreasing: 0,
        unavailable: 1,
      });
    }
    expect
      .soft(await indicatorTrendDirections(publicDb, publishedViews, [cumulative.id], CORNWALL))
      .toEqual(new Map());
    for (const sort of ['trend-better', 'trend-worse', 'trend-desc', 'trend-asc'] as const) {
      const result = await searchIndicators(publicDb, publishedViews, {
        query: '',
        topics: [record.slug],
        indicatorTypes: [],
        lifeStages: [],
        frameworks: [],
        populations: [],
        inequalities: [],
        displayGroups: [],
        areaCodes: [],
        sources: [],
        valueTypes: [],
        yearTypes: [],
        limit: 3,
        sort,
      });
      const first = sort === 'trend-better' || sort === 'trend-desc' ? improving : worsening;
      const second = first === improving ? worsening : improving;
      expect
        .soft(result.indicators.map(({ slug }) => slug))
        .toEqual([first.slug, second.slug, cumulative.slug]);
    }
  }
});

it('counts suppressed points before period length for England and local trends', async () => {
  const fixture = await publishedIndicator('Period length trend tie');
  for (const areaId of [englandId, westSussexId]) {
    await addSeries(fixture, areaId, [null, 1, 2, 3, 4, 5]);
    await addSeries(fixture, areaId, [5, 4, 3, 2, 1], [], 7);
  }
  for (const code of ['E92000001', WEST_SUSSEX])
    expect(await indicatorTrendDirections(publicDb, publishedViews, [fixture.id], code)).toEqual(
      new Map([[fixture.id, 'up']]),
    );
});

it('elects multi-year periods on equal row counts and leaves their trend uncalculated', async () => {
  const fixture = await publishedIndicator('Equal point count period length tie');
  for (const areaId of [englandId, westSussexId]) {
    await addSeries(fixture, areaId, [1, 2, 3, 4, 5]);
    await addSeries(fixture, areaId, [5, 4, 3, 2, 1], [], 7);
  }
  for (const code of ['E92000001', WEST_SUSSEX])
    expect(await indicatorTrendDirections(publicDb, publishedViews, [fixture.id], code)).toEqual(
      new Map([[fixture.id, null]]),
    );
});

it('classifies and orders the same calendar fixture rows identically in SQL and JS', async () => {
  const fixture = await publishedIndicator('Calendar classification parity');
  const periods = [
    ['2023-01-01', '2023-03-31', '3-month'],
    ['2024-01-01', '2024-03-31', '3-month'],
    ['2024-04-01', '2024-06-30', '3-month'],
    ['2024-07-01', '2024-09-30', '3-month'],
    ['2023-02-01', '2023-02-28', '1-month'],
    ['2024-02-01', '2024-02-29', '1-month'],
    ['2024-04-01', '2024-04-30', '1-month'],
    ['2024-01-01', '2024-01-31', '1-month'],
    ['2024-01-31', '2024-02-28', '1-month'],
    ['2024-01-31', '2024-02-29', '1-month'],
    ['2023-01-31', '2023-02-27', '1-month'],
    ['2023-01-31', '2023-02-28', '1-month'],
    ['2024-01-30', '2024-02-28', '1-month'],
    ['2024-01-30', '2024-02-29', '1-month'],
    ['2024-03-31', '2024-04-30', '1-month'],
    ['2024-01-15', '2024-02-14', '1-month'],
    ['2023-12-15', '2024-03-14', '3-month'],
    ['2020-01-01', '2021-06-30', '18-month'],
    ['2024-02-29', '2025-02-27', '1-year'],
    ['2024-02-29', '2025-02-28', '1-year'],
    ['2024-04-01', '2025-03-31', '1-year'],
    ['2021-01-01', '2022-05-15', '500-day'],
    ['2021-01-01', '2022-07-04', '550-day'],
    ['2021-01-01', '2022-12-31', '2-year'],
    ['2024-01-01', '2024-01-01', '1-day'],
    ['2020-01-01', '2021-07-01', '548-day'],
    ['2024-01-31', '2024-02-27', '28-day'],
    ['2024-01-31', '2024-03-01', '31-day'],
    ['2024-01-01', '2024-01-30', '30-day'],
    ['2024-02-29', '2025-03-01', '367-day'],
  ] as const;
  await database.db.insert(observation).values(
    periods.map(([fromDate, toDate]) => ({
      indicatorId: fixture.id,
      uploadBatchId: fixture.batchId,
      areaId: englandId,
      dimensionKey: '',
      fromDate,
      toDate,
      value: 1,
    })),
  );
  const type = observationPeriodSql(observation.fromDate, observation.toDate);
  const rows = await database.db
    .select({
      fromDate: observation.fromDate,
      toDate: observation.toDate,
      type,
      length: periodLengthSql(type),
    })
    .from(observation)
    .where(eq(observation.indicatorId, fixture.id))
    .orderBy(periodLengthSql(type));
  expect(rows).toHaveLength(periods.length);
  for (const row of rows) {
    const expected = periods.find(
      ([fromDate, toDate]) => fromDate === row.fromDate && toDate === row.toDate,
    );
    expect(row.type).toBe(expected?.[2]);
    expect(row.type).toBe(observationPeriodType(row));
    expect(Number(row.length)).toBe(periodTypeLength(row.type));
  }
  expect([...new Set(rows.map(({ type }) => type))]).toEqual(seriesPeriodTypes(rows));
});

it('keeps quarterly trend histories together across 90, 91 and 92 day spans', async () => {
  const fixture = await publishedIndicator('Quarterly trend history');
  await database.db.insert(observation).values(
    [
      ['2023-01-01', '2023-03-31'],
      ['2023-04-01', '2023-06-30'],
      ['2023-07-01', '2023-09-30'],
      ['2023-10-01', '2023-12-31'],
      ['2024-01-01', '2024-03-31'],
    ].flatMap(([fromDate = '', toDate = ''], index) =>
      [englandId, westSussexId].map((areaId) => ({
        indicatorId: fixture.id,
        uploadBatchId: fixture.batchId,
        areaId,
        dimensionKey: '',
        fromDate,
        toDate,
        value: index + 1,
        count: (index + 1) * 100,
        denominator: 10000,
        lowerCi95: index + 0.5,
        upperCi95: index + 1.5,
      })),
    ),
  );
  for (const code of ['E92000001', WEST_SUSSEX]) {
    const summary = (
      await indicatorTrendSummaries(publicDb, publishedViews, [fixture.id], code)
    ).get(fixture.id);
    // Quarters follow on from each other, but a run needs periods a year apart.
    expect(summary).toMatchObject({ annual: false, run: 1 });
    expect(summary?.points.map(({ value }) => value)).toEqual([5]);
    // Fingertips calculates no recent trend for periods shorter than a year.
    expect(await indicatorTrendDirections(publicDb, publishedViews, [fixture.id], code)).toEqual(
      new Map([[fixture.id, null]]),
    );
  }
});

it.each([
  [1, 30, 'up'],
  [1, 31, 'down'],
  [3, 91, 'up'],
  [3, 92, 'down'],
] as const)(
  'breaks month/day trend ties for %i months and %i days as %s',
  async (months, days, trend) => {
    const fixture = await publishedIndicator(`Month day trend tie ${months} ${days}`);
    const month = months === 1 ? (days === 30 ? 1 : 2) : days === 91 ? 7 : 1;
    const points = Array.from({ length: 5 }, (_, index) => {
      const toDate = new Date(Date.UTC(2050 + index, month - 1 + months, 14))
        .toISOString()
        .slice(0, 10);
      return [
        {
          fromDate: `${2050 + index}-${String(month).padStart(2, '0')}-15`,
          toDate,
          value: index + 1,
          count: (index + 1) * 100,
          denominator: 10000,
          lowerCi95: index + 0.5,
          upperCi95: index + 1.5,
          dimensions: [],
        },
        {
          fromDate: new Date(Date.parse(toDate) - (days - 1) * 86_400_000)
            .toISOString()
            .slice(0, 10),
          toDate,
          value: 5 - index,
          count: (5 - index) * 100,
          denominator: 10000,
          lowerCi95: 4.5 - index,
          upperCi95: 5.5 - index,
          dimensions: [],
        },
      ];
    }).flat();
    expect(headlineSeries(points).map(({ value }) => value)).toEqual(
      trend === 'up' ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1],
    );
    await database.db.insert(observation).values(
      points.map(({ dimensions, ...point }) => ({
        ...point,
        indicatorId: fixture.id,
        uploadBatchId: fixture.batchId,
        areaId: englandId,
        dimensionKey: '',
      })),
    );
    // The latest point of the summary is the latest of the series the tie elects.
    const summary = (await indicatorTrendSummaries(publicDb, publishedViews, [fixture.id])).get(
      fixture.id,
    );
    expect(summary?.points.at(-1)?.value).toBe(trend === 'up' ? 5 : 1);
    expect(await indicatorTrendDirections(publicDb, publishedViews, [fixture.id])).toEqual(
      new Map([[fixture.id, null]]),
    );
  },
);
