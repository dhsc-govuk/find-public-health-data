import { and, eq, inArray, min } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from './client.ts';
import {
  getIndicatorObservationsForAreas,
  type IndicatorSearchFilters,
  searchIndicators,
} from './indicator-repository.ts';
import { indicatorTrendDirections } from './indicator-trends.ts';
import {
  dimensionType,
  dimensionValue,
  indicator,
  indicatorVersion,
  observation,
  observationDimension,
  publishedArea,
  publishedIndicator,
  publishedIndicatorSubtopic,
  publishedObservation,
  publishedSubtopic,
  publishedTopic,
  uploadBatch,
} from './schema/index.ts';
import { createTestDb, type TestDb } from './testing.ts';
import { listTopicSubtopics } from './topic-repository.ts';

let database: TestDb;
let db: Database;
const filters = (overrides: Partial<IndicatorSearchFilters> = {}): IndicatorSearchFilters => ({
  query: '',
  topics: [],
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
  limit: 10,
  page: 1,
  sort: 'name-asc',
  ...overrides,
});

beforeAll(async () => {
  database = await createTestDb({ template: 'seeded' });
  db = database.db;
});
afterAll(async () => {
  await database.drop();
});

it('paginates a topic-sized result set past the old 200-indicator cap', async () => {
  const [source] = await db
    .select()
    .from(indicatorVersion)
    .where(eq(indicatorVersion.status, 'published'))
    .limit(1);
  if (!source) throw new Error('Published seed version missing');
  const identities = await db
    .insert(indicator)
    .values(Array.from({ length: 205 }, (_, index) => ({ shortId: 600000 + index })))
    .returning();
  await db.insert(indicatorVersion).values(
    identities.map((identity, index) => ({
      ...source,
      id: undefined,
      indicatorId: identity.id,
      name: `Topic pagination fixture ${String(index).padStart(3, '0')}`,
      slug: `topic-pagination-fixture-${index}`,
      uploadBatchId: null,
      dataTableConfirmedAt: null,
    })),
  );
  const result = await searchIndicators(
    db,
    filters({ query: 'Topic pagination fixture', page: 21 }),
  );
  expect(result).toMatchObject({ total: 205, page: 21, limit: 10 });
  expect(result.indicators.map(({ shortId }) => shortId)).toEqual([
    600200, 600201, 600202, 600203, 600204,
  ]);
  const descending = await searchIndicators(
    db,
    filters({ query: 'Topic pagination fixture', sort: 'name-desc', page: 99 }),
  );
  expect(descending.page).toBe(21);
  expect(descending.indicators.map(({ shortId }) => shortId)).toEqual([
    600004, 600003, 600002, 600001, 600000,
  ]);
});

it('sorts by the most recent published period before selecting a page', async () => {
  const result = await searchIndicators(db, filters({ sort: 'period-desc', limit: 2 }));
  const periods = await Promise.all(
    result.indicators.map(async ({ shortId }) => {
      const [identity] = await db
        .select({ id: publishedIndicator.id })
        .from(publishedIndicator)
        .where(eq(publishedIndicator.shortId, shortId));
      const rows = await db
        .select({ toDate: publishedObservation.toDate })
        .from(publishedObservation)
        .where(eq(publishedObservation.indicatorId, identity?.id ?? ''));
      return rows
        .map(({ toDate }) => toDate)
        .sort()
        .at(-1);
    }),
  );
  expect(periods[0]).toBeTruthy();
  expect(periods[1]).toBeTruthy();
  expect((periods[0] ?? '') >= (periods[1] ?? '')).toBe(true);
});

it('sorts a whole topic by its subtopics before paginating', async () => {
  const all = await searchIndicators(
    db,
    filters({ topics: ['diabetes'], sort: 'subtopic-asc', limit: 100 }),
  );
  const ids = all.indicators.map(({ shortId }) => shortId);
  expect(ids.length).toBeGreaterThan(1);
  const titles = await db
    .select({ shortId: publishedIndicator.shortId, title: min(publishedSubtopic.title) })
    .from(publishedIndicator)
    .innerJoin(
      publishedIndicatorSubtopic,
      eq(publishedIndicatorSubtopic.indicatorId, publishedIndicator.id),
    )
    .innerJoin(publishedSubtopic, eq(publishedIndicatorSubtopic.subtopicId, publishedSubtopic.id))
    .innerJoin(publishedTopic, eq(publishedIndicatorSubtopic.topicId, publishedTopic.id))
    .where(and(eq(publishedTopic.slug, 'diabetes'), inArray(publishedIndicator.shortId, ids)))
    .groupBy(publishedIndicator.shortId);
  const byId = new Map(titles.map(({ shortId, title }) => [shortId, title]));
  const ordered = ids.map((id) => byId.get(id) ?? null);
  expect(ordered.filter((title) => title !== null)).toEqual(
    [...ordered.filter((title) => title !== null)].sort(),
  );
  expect(ordered.slice(ordered.filter((title) => title !== null).length)).toEqual(
    Array(ordered.filter((title) => title === null).length).fill(null),
  );
  const secondPage = await searchIndicators(
    db,
    filters({ topics: ['diabetes'], sort: 'subtopic-asc', limit: 1, page: 2 }),
  );
  expect(secondPage.indicators.map(({ shortId }) => shortId)).toEqual(ids.slice(1, 2));
});

it('filters subtopics within their topic before paginating', async () => {
  expect(await listTopicSubtopics(db, 'diabetes')).toContainEqual({
    slug: 'prevalence-and-risk',
    title: 'Prevalence and risk',
  });
  const result = await searchIndicators(
    db,
    filters({
      topics: ['diabetes'],
      subtopics: ['prevalence-and-risk'],
      page: 1,
    }),
  );
  expect(result.total).toBe(1);
  expect(result.indicators.map(({ shortId }) => shortId)).toEqual([241]);
  const both = await searchIndicators(
    db,
    filters({
      topics: ['diabetes'],
      subtopics: ['prevalence-and-risk', 'complications'],
      page: 1,
    }),
  );
  expect(both.indicators.map(({ shortId }) => shortId).sort((a, b) => a - b)).toEqual([241, 93995]);
  expect(
    (
      await searchIndicators(
        db,
        filters({
          topics: ['diabetes'],
          subtopics: ['all-cancers'],
        }),
      )
    ).total,
  ).toBe(0);
});

it('filters year coverage and data refreshes without exposing unpublished data', async () => {
  const [identity] = await db
    .select({ id: publishedIndicator.id })
    .from(publishedIndicator)
    .where(eq(publishedIndicator.shortId, 108));
  if (!identity) throw new Error('Seed indicator missing');
  await db
    .update(indicator)
    .set({ dataUpdatedAt: new Date() })
    .where(eq(indicator.id, identity.id));
  expect(
    (
      await searchIndicators(
        db,
        filters({ query: '108', dataFromYear: 2020, dataToYear: 2020, updatedWithinMonths: 3 }),
      )
    ).total,
  ).toBe(1);
  expect((await searchIndicators(db, filters({ query: '108', dataToYear: 2999 }))).total).toBe(0);
  expect((await searchIndicators(db, filters({ query: '108', dataFromYear: 2999 }))).total).toBe(0);
  expect((await searchIndicators(db, filters({ query: '108', dataToYear: 1000 }))).total).toBe(0);
  await db
    .update(indicator)
    .set({ dataUpdatedAt: new Date('2000-01-01') })
    .where(eq(indicator.id, identity.id));
  expect(
    (await searchIndicators(db, filters({ query: '108', updatedWithinMonths: 12 }))).total,
  ).toBe(0);
});

it('keeps requested area order, empty known areas, dimensions and value notes in a batch', async () => {
  const [identity] = await db
    .select({ id: publishedIndicator.id })
    .from(publishedIndicator)
    .where(eq(publishedIndicator.shortId, 108));
  if (!identity) throw new Error('Seed indicator missing');
  const data = await getIndicatorObservationsForAreas(db, identity.id, [
    'E07000223',
    'UNKNOWN',
    'E92000001',
  ]);
  expect(data.map(({ areaCode }) => areaCode)).toEqual(['E07000223', 'E92000001']);
  expect(
    data[1]?.observations.some(({ dimensions }) => dimensions.some(({ type }) => type === 'Sex')),
  ).toBe(true);
  expect(data[1]?.observations.every(({ notes }) => Array.isArray(notes))).toBe(true);
  const [known] = await db
    .select({ code: publishedArea.code })
    .from(publishedArea)
    .where(and(eq(publishedArea.code, 'E92000001')));
  expect(known).toBeTruthy();
  expect(
    await getIndicatorObservationsForAreas(db, '00000000-0000-7000-8000-000000000000', [
      'E92000001',
      'UNKNOWN',
    ]),
  ).toEqual([{ areaCode: 'E92000001', areaName: 'England', observations: [] }]);
});

it('sorts trends across all matching indicators before paginating, with uncalculated trends last', async () => {
  const all = await db
    .select({
      id: publishedIndicator.id,
      name: publishedIndicator.name,
      shortId: publishedIndicator.shortId,
    })
    .from(publishedIndicator);
  const directions = await indicatorTrendDirections(
    db,
    all.map(({ id }) => id),
  );
  const results = await searchIndicators(db, filters({ sort: 'trend-desc', limit: 2 }));
  const rank = (shortId: number) => {
    const direction = directions.get(all.find((entry) => entry.shortId === shortId)?.id ?? '');
    return direction == null ? 3 : direction === 'up' ? 0 : direction === 'right' ? 1 : 2;
  };
  expect(results.indicators).toHaveLength(2);
  expect(results.indicators.every(({ shortId }) => rank(shortId) < 3)).toBe(true);
  const last = await searchIndicators(db, filters({ sort: 'trend-asc', page: 999 }));
  expect(last.indicators.every(({ shortId }) => rank(shortId) === 3)).toBe(true);
});

it('uses polarity to put improving or worsening trends first', async () => {
  const [diabetes] = await db
    .select()
    .from(publishedIndicator)
    .where(eq(publishedIndicator.shortId, 241));
  if (!diabetes) throw new Error('Seed diabetes indicator missing');
  await db
    .update(indicatorVersion)
    .set({ polarity: 'lower-is-better' })
    .where(eq(indicatorVersion.indicatorId, diabetes.id));
  try {
    for (const sort of ['trend-better', 'trend-worse'] as const) {
      const result = await searchIndicators(db, filters({ sort, limit: 100 }));
      const ids = result.indicators.map(({ shortId }) => shortId);
      expect(ids).toContain(108);
      expect(ids).toContain(241);
      if (sort === 'trend-better') expect(ids.indexOf(108)).toBeLessThan(ids.indexOf(241));
      else expect(ids.indexOf(241)).toBeLessThan(ids.indexOf(108));
    }
  } finally {
    await db
      .update(indicatorVersion)
      .set({ polarity: diabetes.polarity })
      .where(eq(indicatorVersion.indicatorId, diabetes.id));
  }
});

it('selects the longest valid trend among equally disaggregated series', async () => {
  const [source] = await db
    .select()
    .from(indicatorVersion)
    .where(eq(indicatorVersion.status, 'published'))
    .limit(1);
  const [england] = await db
    .select()
    .from(publishedArea)
    .where(eq(publishedArea.code, 'E92000001'));
  const [sex] = await db.select().from(dimensionType).where(eq(dimensionType.name, 'Sex'));
  if (!source || !england || !sex) throw new Error('Seed trend fixtures missing');
  const sexes = await db
    .select()
    .from(dimensionValue)
    .where(eq(dimensionValue.dimensionTypeId, sex.id));
  const [identity] = await db.insert(indicator).values({}).returning();
  if (!identity) throw new Error('Trend fixture indicator missing');
  const [version] = await db
    .insert(indicatorVersion)
    .values({
      ...source,
      id: undefined,
      indicatorId: identity.id,
      name: 'Valid trend fixture',
      slug: 'valid-trend-fixture',
      uploadBatchId: null,
      dataTableConfirmedAt: null,
    })
    .returning();
  if (!version) throw new Error('Trend fixture version missing');
  const [batch] = await db
    .insert(uploadBatch)
    .values({
      indicatorId: identity.id,
      indicatorVersionId: version.id,
      originalFilename: 'trend.csv',
      uploadedBy: source.createdBy,
      status: 'processed',
    })
    .returning();
  if (!batch) throw new Error('Trend fixture batch missing');
  await db
    .update(indicatorVersion)
    .set({ uploadBatchId: batch.id })
    .where(eq(indicatorVersion.id, version.id));
  for (const [name, values] of [
    ['Female', [1, 2, 3, 4, 5]],
    ['Male', [null, null, null, null, null, null]],
  ] as const) {
    const dimension = sexes.find((row) => row.name === name);
    if (!dimension) throw new Error('Sex dimension fixture missing');
    const rows = await db
      .insert(observation)
      .values(
        values.map((value, index) => ({
          indicatorId: identity.id,
          areaId: england.id,
          fromDate: `${2010 + index}-01-01`,
          toDate: `${2010 + index}-12-31`,
          value,
          dimensionKey: dimension.id,
          uploadBatchId: batch.id,
        })),
      )
      .returning();
    await db.insert(observationDimension).values(
      rows.map((row) => ({
        observationId: row.id,
        dimensionValueId: dimension.id,
        dimensionTypeId: sex.id,
      })),
    );
  }
  expect((await indicatorTrendDirections(db, [identity.id])).get(identity.id)).toBe('up');
});
