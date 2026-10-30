import { readFileSync } from 'node:fs';

import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertCoreDataPresent, importCoreData } from './core-data.ts';
import { migrateToLatest } from './migrations.ts';
import { migrateBefore, migrateThrough } from './testing.ts';

const { SYSTEM_USER_IDS } = schema;

const MIGRATION = '0037_value-type-and-unit-core-data';

const CORE: { id: string; name: string }[] = JSON.parse(
  readFileSync(new URL('../data/comparator-methods.json', import.meta.url), 'utf-8'),
);

function coreId(name: string): string {
  const row = CORE.find((candidate) => candidate.name === name);
  if (!row) throw new Error(`No comparator method named ${name}`);
  return row.id;
}

// Rows as a snapshot import loads them: the core names under ids of their own.
const QUINTILES = { id: '019de000-0000-7000-8000-000000000001', name: 'Quintiles' };
const NO_COMPARISON = { id: '019de000-0000-7000-8000-000000000002', name: 'No comparison' };
const UNNAMED = { id: '019de000-0000-7000-8000-000000000003', name: 'Tertiles' };

/** A database migrated to just before this one, holding the rows and a version naming one. */
async function withSnapshotRows(
  rows: { id: string; name: string }[],
  versionComparatorId: string,
): Promise<[TestDb, postgres.Sql]> {
  const testDb = await createTestDb({ template: 'unmigrated' });
  const sql = testDb.sql;
  await migrateBefore(sql, MIGRATION);

  await sql`INSERT INTO comparator_method ${sql(rows)}`;
  await sql`
    WITH created AS (INSERT INTO indicator (short_id) VALUES (1) RETURNING id)
    INSERT INTO indicator_version
      (indicator_id, name, slug, comparator_method_id, created_by, updated_by)
    SELECT created.id, 'Indicator 1', 'indicator-1', ${versionComparatorId},
           ${SYSTEM_USER_IDS.pholioMigration}, ${SYSTEM_USER_IDS.pholioMigration}
    FROM created
  `;

  return [testDb, sql];
}

describe(`migration ${MIGRATION} over a snapshot's comparator methods`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    [testDb, sql] = await withSnapshotRows([QUINTILES, NO_COMPARISON, UNNAMED], QUINTILES.id);
    await migrateThrough(sql, MIGRATION);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it("points the version at the core data's id for its comparator method", async () => {
    const [version] = await sql`SELECT comparator_method_id FROM indicator_version`;

    expect(version).toEqual({ comparator_method_id: coreId('Quintiles') });
  });

  it('keeps only rows under the ids the core data gives their names', async () => {
    const rows = await sql`SELECT id, name FROM comparator_method ORDER BY name`;

    expect(rows).toEqual([
      { id: coreId('No comparison'), name: 'No comparison' },
      { id: coreId('Quintiles'), name: 'Quintiles' },
    ]);
  });
});

describe(`migration ${MIGRATION} followed by import-core-data`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    [testDb, sql] = await withSnapshotRows([QUINTILES, NO_COMPARISON], NO_COMPARISON.id);
    await migrateToLatest(sql);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('imports every comparator method, leaving the core data complete', async () => {
    const { comparatorMethods } = await importCoreData(sql);
    const rows = await sql`SELECT id, name FROM comparator_method`;

    expect(comparatorMethods.orphaned).toEqual([]);
    expect(rows).toHaveLength(CORE.length);
    expect(rows).toEqual(expect.arrayContaining(CORE));
    await expect(assertCoreDataPresent(sql)).resolves.toBeUndefined();
  });
});

describe(`migration ${MIGRATION} over a version naming a comparator method the core data lacks`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    [testDb, sql] = await withSnapshotRows([UNNAMED], UNNAMED.id);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('stops rather than drop the answer', async () => {
    await expect(migrateThrough(sql, MIGRATION)).rejects.toThrow(
      /comparator method data\/comparator-methods.json does not name/,
    );
  });
});
