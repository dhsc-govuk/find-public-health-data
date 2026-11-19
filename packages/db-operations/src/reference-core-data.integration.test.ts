import { createTestDb, type TestDb } from '@fphd/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertCoreDataPresent, importCoreData } from './core-data.ts';
import { importReferenceCoreData, readReferenceData } from './reference-core-data.ts';

const records = readReferenceData();

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
