import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  listAreaNeighbours,
  listAreaParents,
  listAreasByCodes,
  listAreasByGroup,
  listIndicatorAreas,
} from './area-repository.ts';
import type { Database } from './client.ts';
import { resolvePublishedIndicatorId } from './indicator-repository.ts';
import { area, areaNeighbour, areaType, observation, publishedViews } from './schema/index.ts';
import { createTestDb, type TestDb } from './testing.ts';

let database: TestDb;
let db: Database;
beforeAll(async () => {
  database = await createTestDb({ template: 'seeded' });
  db = database.db;
});
afterAll(async () => {
  await database.drop();
});

it('omits catalogue areas that have no published observations for this indicator', async () => {
  const id = await resolvePublishedIndicatorId(db, publishedViews, 108);
  if (!id) throw new Error('Seeded indicator missing');
  const groups = await listIndicatorAreas(db, publishedViews, id, {
    displayGroup: 'Local authorities',
    limit: 2,
  });
  const target = groups[0]?.areas[0];
  if (!target) throw new Error('Seeded local area missing');
  expect(groups[0]?.areas).toHaveLength(2);
  const [record] = await db
    .select({ id: area.id })
    .from(area)
    .where(eq(area.code, target.code))
    .limit(1);
  if (!record) throw new Error('Area registry entry missing');
  await db
    .delete(observation)
    .where(and(eq(observation.indicatorId, id), eq(observation.areaId, record.id)));
  expect(await listAreasByGroup(db, publishedViews, 'Local authorities')).toContainEqual(target);
  const available = await listIndicatorAreas(db, publishedViews, id, {
    displayGroup: 'Local authorities',
    query: target.code,
  });
  expect(available).toEqual([]);
});

it('bounds previews independently for each geography level', async () => {
  const id = await resolvePublishedIndicatorId(db, publishedViews, 108);
  if (!id) throw new Error('Seeded indicator missing');
  const groups = await listIndicatorAreas(db, publishedViews, id, { limit: 1 });
  expect(groups.length).toBeGreaterThan(1);
  expect(groups.every(({ areas }) => areas.length === 1)).toBe(true);
});

it('does not advertise placeholder series whose values are all null', async () => {
  const id = await resolvePublishedIndicatorId(db, publishedViews, 108);
  if (!id) throw new Error('Seeded indicator missing');
  const groups = await listIndicatorAreas(db, publishedViews, id, {
    displayGroup: 'Local authorities',
    limit: 1,
  });
  const target = groups[0]?.areas[0];
  if (!target) throw new Error('Seeded area missing');
  const [record] = await db
    .select({ id: area.id })
    .from(area)
    .where(eq(area.code, target.code))
    .limit(1);
  if (!record) throw new Error('Area registry entry missing');
  await db
    .update(observation)
    .set({ value: null })
    .where(and(eq(observation.indicatorId, id), eq(observation.areaId, record.id)));
  expect(await listIndicatorAreas(db, publishedViews, id, { query: target.code })).toEqual([]);
  expect(
    await listIndicatorAreas(db, publishedViews, id, {
      query: target.code,
      scope: 'all-data',
    }),
  ).toEqual([{ displayGroup: 'Local authorities', areas: [target] }]);
  expect(
    await db
      .select({ id: observation.id })
      .from(observation)
      .where(and(eq(observation.indicatorId, id), eq(observation.areaId, record.id)))
      .limit(1),
  ).toHaveLength(1);
});

it('bounds ungrouped area types independently in all-data exports', async () => {
  const id = await resolvePublishedIndicatorId(db, publishedViews, 108);
  if (!id) throw new Error('Seeded indicator missing');
  const groups = await listIndicatorAreas(db, publishedViews, id, { limit: 1 });
  const codes = groups.slice(0, 2).flatMap(({ areas }) => areas.map(({ code }) => code));
  const types = await db
    .select({ id: areaType.id, name: areaType.name })
    .from(areaType)
    .innerJoin(area, eq(area.areaTypeId, areaType.id))
    .where(inArray(area.code, codes));
  expect(types).toHaveLength(2);
  await db
    .update(areaType)
    .set({ displayGroup: null })
    .where(
      inArray(
        areaType.id,
        types.map(({ id }) => id),
      ),
    );
  const exported = await listIndicatorAreas(db, publishedViews, id, {
    scope: 'all-data',
    limit: 1,
  });
  for (const type of types)
    expect(exported.find(({ displayGroup }) => displayGroup === type.name)?.areas).toHaveLength(1);
});

it('adds each area’s current parent of the requested type in the same listing', async () => {
  const id = await resolvePublishedIndicatorId(db, publishedViews, 108);
  if (!id) throw new Error('Seeded indicator missing');
  const [plain] = await listIndicatorAreas(db, publishedViews, id, {
    displayGroup: 'Local authorities',
  });
  const [withRegions] = await listIndicatorAreas(db, publishedViews, id, {
    displayGroup: 'Local authorities',
    parentType: 'Regions (statistical)',
  });
  expect(plain?.areas.every((entry) => !('parent' in entry))).toBe(true);
  expect(withRegions?.areas.map(({ code }) => code)).toEqual(plain?.areas.map(({ code }) => code));
  const hartlepool = withRegions?.areas.find(({ code }) => code === 'E06000001');
  expect(hartlepool?.parent).toEqual({ code: 'E12000001', name: 'North East' });
});

it('lists an upper tier council’s 15 NHS England peer group neighbours, most similar first', async () => {
  const [current] = await db
    .select({ areaId: areaNeighbour.areaId, neighbourAreaId: areaNeighbour.neighbourAreaId })
    .from(areaNeighbour)
    .innerJoin(area, eq(area.id, areaNeighbour.areaId))
    .where(eq(area.code, 'E06000001'))
    .limit(1);
  if (!current) throw new Error('Missing neighbour fixture');
  await db.insert(areaNeighbour).values({
    areaId: current.areaId,
    neighbourAreaId: current.neighbourAreaId,
    scheme: 'An older scheme',
    position: 1,
  });
  const lists = await listAreaNeighbours(db, publishedViews, ['E06000001', 'E07000223', 'X']);
  expect(lists.map(({ code }) => code)).toEqual(['E06000001']);
  expect(lists[0]?.neighbours).toHaveLength(15);
  expect(lists[0]?.neighbours.slice(0, 3)).toEqual(['E06000006', 'E08000023', 'E08000011']);
  expect(await listAreaNeighbours(db, publishedViews, [])).toEqual([]);
});

it('includes benchmark memberships in one area lookup statement when requested', async () => {
  const codes = ['E08000003', 'E06000001', 'E06000052', 'E07000223', 'E10000032', 'E92000001', 'X'];
  const plain = await listAreasByCodes(db, publishedViews, codes);
  const neighbours = await listAreaNeighbours(db, publishedViews, codes);
  const parents = await listAreaParents(db, publishedViews, codes, 'Combined authorities');
  expect(neighbours.length).toBeGreaterThan(0);
  expect(parents.length).toBeGreaterThan(0);
  expect(plain.every((entry) => !('benchmarks' in entry))).toBe(true);

  const execute = vi.spyOn(db.$client, 'unsafe');
  let enriched: Awaited<ReturnType<typeof listAreasByCodes>>;
  try {
    enriched = await listAreasByCodes(db, publishedViews, codes, true);
    expect(execute).toHaveBeenCalledTimes(1);
  } finally {
    execute.mockRestore();
  }
  expect(enriched.map(({ benchmarks: _benchmarks, ...entry }) => entry)).toEqual(plain);
  expect(
    enriched.flatMap(({ benchmarks }) => benchmarks?.deprivation ?? []).length,
  ).toBeGreaterThan(0);
  for (const entry of enriched) {
    const parent = parents.find(({ code }) => code === entry.code);
    expect(entry.benchmarks?.neighbours).toEqual(
      neighbours.find(({ code }) => code === entry.code)?.neighbours ?? [],
    );
    expect(entry.benchmarks?.combinedAuthority).toEqual(
      parent ? { code: parent.parentCode, name: parent.parentName } : null,
    );
    expect(entry.benchmarks?.deprivation.every(({ code }) => code === entry.code)).toBe(true);
  }
  expect(enriched.find(({ code }) => code === 'E10000032')?.benchmarks?.deprivation).toEqual([
    expect.objectContaining({ code: 'E10000032', scheme: 'IMD2019', tier: 'upper', decile: 9 }),
    expect.objectContaining({ code: 'E10000032', scheme: 'IMD2025', tier: 'upper', decile: 9 }),
  ]);
  expect(enriched.find(({ code }) => code === 'E92000001')?.benchmarks?.deprivation).toEqual([]);
  expect(await listAreasByCodes(db, publishedViews, [], true)).toEqual([]);
});

it('omits retired areas and neighbours from an enriched lookup', async () => {
  await db
    .update(area)
    .set({ isCurrent: false })
    .where(inArray(area.code, ['E06000006', 'E06000052']));
  const enriched = await listAreasByCodes(db, publishedViews, ['E06000001', 'E06000052'], true);
  expect(enriched.map(({ code }) => code)).toEqual(['E06000001']);
  expect(enriched[0]?.benchmarks?.neighbours).not.toContain('E06000006');
  expect(enriched[0]?.benchmarks?.neighbours.length).toBe(14);
});
