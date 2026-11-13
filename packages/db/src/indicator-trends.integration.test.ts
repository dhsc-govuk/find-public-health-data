import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';

import type { Database } from './client.ts';
import { dimensionKey } from './dimension-key.ts';
import { indicatorTrendDirections } from './indicator-trends.ts';
import {
  area,
  areaType,
  dimensionType,
  dimensionValue,
  IMPORTED_INDICATOR_TEAM_ID,
  indicator,
  indicatorVersion,
  observation,
  observationDimension,
  SYSTEM_USER_IDS,
  uploadBatch,
} from './schema/index.ts';
import { apiLogin, createTestDb, type TestDb } from './testing.ts';

let database: TestDb;
let publicDb: Database;
let englandId: string;
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

it.each([0, 1])(
  'prefers a series with %i dimensions over a longer, more disaggregated series as public_api',
  async (dimensionCount) => {
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
        name: `Trend fixture ${dimensionCount}`,
        slug: `trend-fixture-${dimensionCount}`,
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

    for (const series of [
      { values: [1, 2, 3, 4, 5], dimensions: dimensions.slice(0, dimensionCount) },
      { values: [7, 6, 5, 4, 3, 2, 1], dimensions },
    ]) {
      const rows = await db
        .insert(observation)
        .values(
          series.values.map((value, index) => ({
            indicatorId: identity.id,
            areaId: englandId,
            fromDate: `${2010 + index}-01-01`,
            toDate: `${2010 + index}-12-31`,
            value,
            dimensionKey: dimensionKey(series.dimensions.map(({ id }) => id)),
            uploadBatchId: batch.id,
          })),
        )
        .returning();
      if (series.dimensions.length > 0) {
        await db.insert(observationDimension).values(
          rows.flatMap((row) =>
            series.dimensions.map((dimension) => ({
              observationId: row.id,
              dimensionValueId: dimension.id,
              dimensionTypeId: dimension.dimensionTypeId,
            })),
          ),
        );
      }
    }
    expect(await indicatorTrendDirections(publicDb, [identity.id])).toEqual(
      new Map([[identity.id, 'up']]),
    );
  },
);
