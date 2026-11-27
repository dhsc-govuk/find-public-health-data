import { filterSeries, headlineSeries } from '@fphd/utils/observation-series';
import { eq, inArray, isNotNull } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  refreshIndicatorReadModels,
  type Transaction,
} from '../../internal-read-models/src/read-models.ts';
import { dimensionKey } from './dimension-key.ts';
import { getIndicatorObservationData } from './indicator-observation-repository.ts';
import {
  getObservationRange,
  getObservationRangeByCategory,
  getObservationRangeByTier,
} from './indicator-repository.ts';
import { getIndicatorSeriesData } from './indicator-series-repository.ts';
import { indicatorTrendDirections } from './indicator-trends.ts';
import {
  area,
  areaCategory,
  currentPublishedVersion,
  dimensionType,
  dimensionValue,
  indicatorVersion,
  observation,
  observationDimension,
  observationSeriesBatch,
  publishedViews,
  valueType,
} from './schema/index.ts';
import { createTestDb, type TestDb } from './testing.ts';

let database: TestDb;
beforeAll(async () => {
  database = await createTestDb({ template: 'seeded' });
});
afterAll(async () => {
  await database.drop();
});

class RolledBack extends Error {}

async function withSegments(
  check: (tx: Transaction, id: string, categoryId: string) => Promise<void>,
) {
  await database.db
    .transaction(async (tx) => {
      const [model] = await tx
        .select({
          id: currentPublishedVersion.indicatorId,
          batchId: indicatorVersion.uploadBatchId,
        })
        .from(currentPublishedVersion)
        .innerJoin(indicatorVersion, eq(indicatorVersion.id, currentPublishedVersion.id))
        .where(isNotNull(indicatorVersion.uploadBatchId))
        .limit(1);
      const areas = await tx
        .select()
        .from(area)
        .where(inArray(area.code, ['E92000001', 'E06000052', 'E08000003']));
      const dimensions = await tx
        .select({
          id: dimensionValue.id,
          name: dimensionValue.name,
          typeId: dimensionValue.dimensionTypeId,
        })
        .from(dimensionValue)
        .innerJoin(dimensionType, eq(dimensionType.id, dimensionValue.dimensionTypeId))
        .where(inArray(dimensionType.name, ['Sex', 'Age']));
      const findDimension = (name: string) => {
        const value = dimensions.find((dimension) => dimension.name === name);
        if (!value) throw new Error(`Missing ${name}`);
        return value;
      };
      const female = findDimension('Female');
      const male = findDimension('Male');
      const adults = findDimension('18-74 yrs');
      const older = findDimension('70-74 yrs');
      if (!model?.batchId || areas.length !== 3) throw new Error('Missing seeded fixture');
      const uploadBatchId = model.batchId;
      // The recent trend needs a value type that Fingertips calculates one for.
      const [proportion] = await tx
        .select({ id: valueType.id })
        .from(valueType)
        .where(eq(valueType.name, 'Proportion'));
      if (!proportion) throw new Error('Missing Proportion value type');
      await tx
        .update(indicatorVersion)
        .set({ valueTypeId: proportion.id })
        .where(eq(indicatorVersion.indicatorId, model.id));
      await tx.delete(observation).where(eq(observation.indicatorId, model.id));
      const [type] = await tx
        .insert(dimensionType)
        .values({ name: 'Review cohort', dimensionClass: 'inequality' })
        .returning();
      if (!type) throw new Error('Missing category type');
      const [category] = await tx
        .insert(dimensionValue)
        .values({ name: 'Review category', dimensionTypeId: type.id })
        .returning();
      if (!category) throw new Error('Missing category');
      for (const a of areas) {
        if (a.code !== 'E92000001')
          await tx.insert(areaCategory).values({ areaId: a.id, dimensionValueId: category.id });
        for (const [population, points] of [
          [
            [female, adults],
            [
              {
                fromDate: '2022-04-01',
                toDate: '2022-06-30',
                periodType: 'cumulative-quarter-2022-04-01',
                value: 1,
              },
              {
                fromDate: '2022-04-01',
                toDate: '2023-03-31',
                periodType: 'cumulative-quarter-2022-04-01',
                value: 4,
              },
              { fromDate: '2022-04-01', toDate: '2023-03-31', value: 99 },
            ],
          ],
          [
            [female, older],
            [
              {
                fromDate: '2021-04-01',
                toDate: '2022-03-31',
                periodType: 'cumulative-quarter-2021-04-01',
                value: 3,
              },
              { fromDate: '2021-04-01', toDate: '2022-03-31', value: 99 },
            ],
          ],
          [
            [male, adults],
            Array.from({ length: 5 }, (_, index) => ({
              fromDate: `${2024 + index}-04-01`,
              toDate: `${2025 + index}-03-31`,
              value: 5 - index,
              count: (5 - index) * 100,
              denominator: 10000,
              lowerCi95: 4.5 - index,
              upperCi95: 5.5 - index,
            })),
          ],
        ] as const) {
          const rows = await tx
            .insert(observation)
            .values(
              points.map((point) => ({
                ...point,
                indicatorId: model.id,
                uploadBatchId,
                areaId: a.id,
                dimensionKey: dimensionKey(population.map(({ id }) => id)),
              })),
            )
            .returning();
          await tx.insert(observationDimension).values(
            rows.flatMap((row) =>
              population.map((dimension) => ({
                observationId: row.id,
                dimensionTypeId: dimension.typeId,
                dimensionValueId: dimension.id,
              })),
            ),
          );
        }
      }
      await check(tx, model.id, category.id);
      throw new RolledBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RolledBack)) throw error;
    });
}

it('retains annual sex variants in cached and full series and in cached and fallback trends', async () => {
  await withSegments(async (tx, id) => {
    await refreshIndicatorReadModels(tx, id);
    const full = await getIndicatorObservationData(tx, publishedViews, [id], ['E92000001']);
    const points = full.get(id)?.areaData[0]?.observations ?? [];
    const cached = await getIndicatorSeriesData(tx, publishedViews, [id], ['E92000001'], 'recent');
    const summary = cached?.get(id);
    expect.soft(summary?.tableSeries?.some(({ sex }) => sex === 'Male')).toBe(true);
    expect
      .soft(
        summary?.areaData[0]?.observations.some(({ dimensions }) =>
          dimensions.some(({ value }) => value === 'Male'),
        ),
      )
      .toBe(true);
    expect
      .soft(filterSeries(points, { sex: 'Male' }).map(({ value }) => value))
      .toEqual([5, 4, 3, 2, 1]);
    expect.soft(headlineSeries(points).map(({ value }) => value)).toEqual([5, 4, 3, 2, 1]);
    expect
      .soft(await indicatorTrendDirections(tx, publishedViews, [id]))
      .toEqual(new Map([[id, 'down']]));
    expect
      .soft(await indicatorTrendDirections(tx, publishedViews, [id], 'E06000052'))
      .toEqual(new Map([[id, 'down']]));
    await tx.delete(observationSeriesBatch).where(eq(observationSeriesBatch.indicatorId, id));
    expect
      .soft(await indicatorTrendDirections(tx, publishedViews, [id]))
      .toEqual(new Map([[id, 'down']]));
  });
});

it('keeps category, tier and cached ranges for every population without including annual twins', async () => {
  await withSegments(async (tx, id, categoryId) => {
    await refreshIndicatorReadModels(tx, id);
    const ranges = [
      await getObservationRangeByCategory(tx, publishedViews, id, categoryId),
      await getObservationRangeByTier(tx, publishedViews, id, 'upper'),
      await getObservationRange(tx, publishedViews, id, 'Local authorities'),
    ];
    for (const range of ranges) {
      expect.soft(range.filter(({ segment }) => segment === '18-74 yrs|Male')).toHaveLength(5);
      expect.soft(range.find(({ segment }) => segment === '70-74 yrs|Female')).toMatchObject({
        min: 3,
        max: 3,
      });
      expect
        .soft(
          range.find(
            ({ segment, toDate }) => segment === '18-74 yrs|Female' && toDate === '2023-03-31',
          ),
        )
        .toMatchObject({ min: 4, max: 4 });
      expect.soft(range.every(({ max }) => max !== 99)).toBe(true);
    }
  });
});
