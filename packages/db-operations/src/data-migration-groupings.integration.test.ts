import { expect, it } from 'vitest';
import { INDICATOR_ID, VERSION_ID } from './data-migration.testing.ts';
import { dataMigrationTestDb, PUBLISHER } from './data-migration-db.testing.ts';

const db = dataMigrationTestDb();
const id = '11111111-1111-7111-8111-111111111111';
const ageId = '22222222-2222-7222-8222-222222222222';
const ageTypeId = '33333333-3333-7333-8333-333333333333';
const grouping = (years: number, age: string | null = null) => ({
  columns: ['id', 'indicator_id', 'sex_id', 'age_id', 'year_range', 'period_kind'],
  rows: [[id, INDICATOR_ID, null, age, years, 'annual']],
});
const references = {
  dimension_type: {
    columns: ['id', 'name', 'dimension_class', 'is_required'],
    rows: [[ageTypeId, 'Age', 'core', 't']],
  },
  dimension_value: {
    columns: ['id', 'dimension_type_id', 'name', 'sort_order', 'is_aggregate'],
    rows: [[ageId, ageTypeId, '18+ yrs', 18, 'f']],
  },
};

it('maps grouping dimensions onto core data and applies incremental updates and deletes', async () => {
  await db.baseline({ upserts: { ...references, indicator_grouping: grouping(1, ageId) } });
  expect(
    await db.sql`SELECT g.year_range, v.name FROM indicator_grouping g JOIN dimension_value v ON v.id = g.age_id`,
  ).toEqual([{ year_range: 1, name: '18+ yrs' }]);
  await db.apply({ upserts: { ...references, indicator_grouping: grouping(3, ageId) } });
  expect(await db.sql`SELECT year_range FROM published.indicator_grouping`).toEqual([
    { year_range: 3 },
  ]);
  await db.apply({
    migrationId: 'increment-3',
    predecessor: 'increment-2',
    cutoffAt: '2026-09-23T10:00:00Z',
    deletes: { indicator_grouping: [id] },
  });
  expect(await db.sql`SELECT id FROM indicator_grouping`).toEqual([]);
});

it('protects a publisher-owned indicator’s grouping metadata from import changes', async () => {
  await db.baseline({ upserts: { indicator_grouping: grouping(1) } });
  await db.sql`UPDATE indicator_version SET created_by = ${PUBLISHER}, updated_by = ${PUBLISHER} WHERE id = ${VERSION_ID}`;
  const relationships = { indicators: [], indicatorTopics: [] };
  await expect(
    db.apply({ relationships, upserts: { indicator_grouping: grouping(3) } }),
  ).rejects.toThrow(/indicator_grouping upsert conflicts with FPHD publisher work/);
  await expect(db.apply({ relationships, deletes: { indicator_grouping: [id] } })).rejects.toThrow(
    /indicator_grouping delete conflicts with FPHD publisher work/,
  );
});
