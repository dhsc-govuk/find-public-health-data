import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { listAreasByGroup, listIndicatorAreas } from './area-repository.ts';
import type { Database } from './client.ts';
import { resolvePublishedIndicatorId } from './indicator-repository.ts';
import { area, areaType, observation } from './schema/index.ts';
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
  const id = await resolvePublishedIndicatorId(db, 108);
  if (!id) throw new Error('Seeded indicator missing');
  const groups = await listIndicatorAreas(db, id, { displayGroup: 'Local authorities', limit: 2 });
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
    .update(observation)
    .set({ deletedAt: new Date() })
    .where(and(eq(observation.indicatorId, id), eq(observation.areaId, record.id)));
  expect(await listAreasByGroup(db, 'Local authorities')).toContainEqual(target);
  const available = await listIndicatorAreas(db, id, {
    displayGroup: 'Local authorities',
    query: target.code,
  });
  expect(available).toEqual([]);
});

it('bounds previews independently for each geography level', async () => {
  const id = await resolvePublishedIndicatorId(db, 108);
  if (!id) throw new Error('Seeded indicator missing');
  const groups = await listIndicatorAreas(db, id, { limit: 1 });
  expect(groups.length).toBeGreaterThan(1);
  expect(groups.every(({ areas }) => areas.length === 1)).toBe(true);
});

it('does not advertise placeholder series whose values are all null', async () => {
  const id = await resolvePublishedIndicatorId(db, 108);
  if (!id) throw new Error('Seeded indicator missing');
  const groups = await listIndicatorAreas(db, id, { displayGroup: 'Local authorities', limit: 1 });
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
  expect(await listIndicatorAreas(db, id, { query: target.code })).toEqual([]);
  expect(await listIndicatorAreas(db, id, { query: target.code, scope: 'all-data' })).toEqual([
    { displayGroup: 'Local authorities', areas: [target] },
  ]);
  expect(
    await db
      .select({ id: observation.id })
      .from(observation)
      .where(and(eq(observation.indicatorId, id), eq(observation.areaId, record.id)))
      .limit(1),
  ).toHaveLength(1);
});

it('bounds ungrouped area types independently in all-data exports', async () => {
  const id = await resolvePublishedIndicatorId(db, 108);
  if (!id) throw new Error('Seeded indicator missing');
  const groups = await listIndicatorAreas(db, id, { limit: 1 });
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
  const exported = await listIndicatorAreas(db, id, { scope: 'all-data', limit: 1 });
  for (const type of types)
    expect(exported.find(({ displayGroup }) => displayGroup === type.name)?.areas).toHaveLength(1);
});
