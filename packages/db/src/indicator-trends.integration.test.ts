import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from './client.ts';
import { dimensionKey } from './dimension-key.ts';
import { indicatorTrendDirections } from './indicator-trends.ts';
import {
  area,
  areaType,
  dimensionType,
  dimensionValue,
  dimensionValuePublic,
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
let dimensions: (typeof dimensionValue.$inferSelect)[];

beforeAll(async () => {
  database = await createTestDb();
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
      slug: name.toLowerCase().replaceAll(' ', '-'),
      polarity,
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
  return { id: identity.id, versionId: version.id, batchId: batch.id };
}

/** Adds a series of yearly values ending in 2019, so series of any length end together. */
async function addSeries(
  fixture: { id: string; batchId: string },
  areaId: string,
  values: (number | null)[],
  seriesDimensions: (typeof dimensionValue.$inferSelect)[] = [],
) {
  const rows = await database.db
    .insert(observation)
    .values(
      values.map((value, index) => ({
        indicatorId: fixture.id,
        areaId,
        fromDate: `${2020 - values.length + index}-01-01`,
        toDate: `${2020 - values.length + index}-12-31`,
        value,
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
  await database.db.insert(dimensionValuePublic).values([
    {
      id: whole.id,
      slug: '18-74',
      ageFromValue: 18,
      ageFromUnit: 'year',
      ageUnderValue: 75,
      ageUnderUnit: 'year',
    },
    {
      id: band.id,
      slug: '70-74',
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
  // England's cached values run newest first, so these make a falling England trend.
  await database.db.insert(observationSeriesBatch).values({
    uploadBatchId: fixture.batchId,
    indicatorId: fixture.id,
    trendValues: [1, 2, 3, 4, 5],
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
      // Its plain series is all suppressed, so the breakdown with values is the headline.
      [plainSuppressed.id, 'up'],
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
