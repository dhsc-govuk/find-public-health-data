import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertCoreDataPresent, importCoreData } from './core-data.ts';
import { importReferenceCoreData, readReferenceData } from './reference-core-data.ts';
import { migrateBefore, migrateThrough } from './testing.ts';

const records = readReferenceData();
const migration = '0062_core-upload-reference-data';

describe('fresh core-data setup', () => {
  let database: TestDb;

  beforeAll(async () => {
    database = await createTestDb();
  });

  afterAll(async () => {
    await database.drop();
  });

  it('loads the complete upload catalog on a fresh database', async () => {
    const first = await importCoreData(database.sql);
    for (const key of Object.keys(records) as (keyof typeof records)[]) {
      expect(first.references[key].summary).toEqual({
        inserted: records[key].length,
        updated: 0,
        unchanged: 0,
      });
      expect(first.references[key].orphaned).toEqual([]);
    }
    await expect(database.sql`SELECT 1 FROM audit_log`).resolves.toHaveLength(0);
    expect(first.geography.area.summary).toEqual({ inserted: 73302, updated: 0, unchanged: 0 });
    expect(first.geography.area_relationship.summary).toEqual({
      inserted: 158929,
      updated: 0,
      unchanged: 0,
    });
    expect(await database.sql`SELECT id FROM indicator`).toEqual([]);
    await expect(assertCoreDataPresent(database.sql)).resolves.toBeUndefined();
  });

  it('leaves reference rows unchanged on a repeat import', async () => {
    const again = await importCoreData(database.sql);
    for (const key of Object.keys(records) as (keyof typeof records)[]) {
      expect(again.references[key].summary).toEqual({
        inserted: 0,
        updated: 0,
        unchanged: records[key].length,
      });
      expect(again.references[key].orphaned).toEqual([]);
    }
    expect(again.geography.area.summary).toEqual({ inserted: 0, updated: 0, unchanged: 73302 });
    expect(again.geography.area_relationship.summary).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 158929,
    });
  });
});

it('reports extra reference rows and records nothing in the audit log for a changed row', async () => {
  const database = await createTestDb({ template: 'core' });
  try {
    const [extra] = await database.sql<{ id: string }[]>`
      INSERT INTO note_type (text, category) VALUES ('An additional publisher note', 'contextual') RETURNING id
    `;
    const changed = structuredClone(records);
    const note = changed.noteTypes[0];
    if (!note || !extra) throw new Error('Missing reference fixture');
    note.text = 'A renamed core note';
    const result = await importReferenceCoreData(database.sql, changed);
    expect(result.noteTypes.summary).toEqual({
      inserted: 0,
      updated: 1,
      unchanged: records.noteTypes.length - 1,
    });
    expect(result.noteTypes.orphaned).toEqual([
      { id: extra.id, name: 'An additional publisher note' },
    ]);
    await expect(database.sql`SELECT 1 FROM audit_log`).resolves.toHaveLength(0);
  } finally {
    await database.drop();
  }
});

it('rekeys existing references, publisher bridges, parent values, dimension keys and area caches', async () => {
  const database = await createTestDb({ template: 'unmigrated' });
  const sql = database.sql;
  try {
    await migrateBefore(sql, migration);
    const areaType = records.areaTypes.find(({ name }) => name === 'England');
    const sex = records.dimensionTypes.find(({ name }) => name === 'Sex');
    const female = records.dimensionValues.find(
      ({ dimensionTypeId, name }) => dimensionTypeId === sex?.id && name === 'Female',
    );
    const note = records.noteTypes[0];
    if (!areaType || !sex || !female || !note) throw new Error('Missing reference fixture');
    const old = {
      areaType: '019de000-0000-7000-8000-000000000001',
      sex: '019de000-0000-7000-8000-000000000002',
      female: '019de000-0000-7000-8000-000000000003',
      note: '019de000-0000-7000-8000-000000000004',
    };
    await sql`INSERT INTO area_type (id, name, hierarchy_type, level) VALUES (${old.areaType}, ${areaType.name}, 'Administrative', 1)`;
    await sql`INSERT INTO dimension_type (id, name, dimension_class) VALUES (${old.sex}, 'Sex', 'core')`;
    await sql`INSERT INTO dimension_value (id, dimension_type_id, name) VALUES (${old.female}, ${old.sex}, 'Female')`;
    const [child] = await sql<
      { id: string }[]
    >`INSERT INTO dimension_value (dimension_type_id, parent_id, name) VALUES (${old.sex}, ${old.female}, 'An existing publisher value') RETURNING id`;
    await sql`INSERT INTO note_type (id, text, category) VALUES (${old.note}, ${note.text}, ${note.category})`;
    const [area] = await sql<
      { id: string }[]
    >`INSERT INTO area (code, name, area_type_id, valid_from) VALUES ('E92000001', 'England', ${old.areaType}, '2000-01-01') RETURNING id`;
    const [indicator] = await sql<
      { id: string }[]
    >`INSERT INTO indicator DEFAULT VALUES RETURNING id`;
    if (!area || !indicator || !child) throw new Error('Missing observation fixture');
    const [version] = await sql<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
      VALUES (${indicator.id}, 'A publisher draft', 'a-publisher-draft', ${schema.SYSTEM_USER_IDS.testSeed}, ${schema.SYSTEM_USER_IDS.testSeed}) RETURNING id
    `;
    if (!version) throw new Error('Missing draft');
    const [batch] = await sql<
      { id: string }[]
    >`INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by, status) VALUES (${indicator.id}, ${version.id}, 'publisher.csv', ${schema.SYSTEM_USER_IDS.testSeed}, 'processed') RETURNING id`;
    if (!batch) throw new Error('Missing batch');
    const [observation] = await sql<
      { id: string }[]
    >`INSERT INTO observation (indicator_id, area_id, upload_batch_id, from_date, to_date, value, dimension_key) VALUES (${indicator.id}, ${area.id}, ${batch.id}, '2025-01-01', '2025-12-31', 12.5, ${old.female}) RETURNING id`;
    if (!observation) throw new Error('Missing observation');
    await sql`INSERT INTO observation_dimension (observation_id, dimension_type_id, dimension_value_id) VALUES (${observation.id}, ${old.sex}, ${old.female})`;
    await sql`INSERT INTO observation_note (observation_id, note_type_id) VALUES (${observation.id}, ${old.note})`;
    await sql`INSERT INTO available_data (indicator_id, area_type_id, area_type_name, area_count) VALUES (${indicator.id}, ${old.areaType}, 'England', 1)`;
    await migrateThrough(sql, migration);
    expect(await sql`SELECT area_type_id FROM area`).toEqual([{ area_type_id: areaType.id }]);
    expect(
      await sql`SELECT dimension_type_id, dimension_value_id FROM observation_dimension`,
    ).toEqual([{ dimension_type_id: sex.id, dimension_value_id: female.id }]);
    expect(
      await sql`SELECT parent_id, dimension_type_id FROM dimension_value WHERE id = ${child.id}`,
    ).toEqual([{ parent_id: female.id, dimension_type_id: sex.id }]);
    expect(await sql`SELECT value, dimension_key, upload_batch_id FROM observation`).toEqual([
      { value: 12.5, dimension_key: female.id, upload_batch_id: batch.id },
    ]);
    expect(await sql`SELECT note_type_id FROM observation_note`).toEqual([
      { note_type_id: note.id },
    ]);
    expect(await sql`SELECT area_type_id FROM available_data`).toEqual([
      { area_type_id: areaType.id },
    ]);
    await importCoreData(sql);
    expect(await sql`SELECT id FROM observation`).toEqual([{ id: observation.id }]);
  } finally {
    await database.drop();
  }
});
