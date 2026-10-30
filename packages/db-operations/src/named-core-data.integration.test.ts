import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { schema } from '@fphd/db';
import { auditEntriesFor, createTestDb, type TestDb } from '@fphd/db/testing';
import { countIsNumerator } from '@fphd/utils/value-type-and-unit';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { importCoreData } from './core-data.ts';
import {
  type NamedRecord,
  parseNamedRecordsFile,
  upsertComparatorMethods,
  upsertOrderedNames,
} from './named-core-data.ts';
import { loadIndicatorVersions } from './seeding.ts';

const { SYSTEM_USER_IDS, valueType } = schema;

function committed(list: string, file: string): NamedRecord[] {
  const path = new URL(`../data/${file}`, import.meta.url);
  return parseNamedRecordsFile(list, JSON.parse(readFileSync(path, 'utf-8')));
}

const VALUE_TYPES = committed('value types', 'value-types.json');
const UNITS = committed('units', 'units.json');
const COMPARATOR_METHODS = committed('comparator methods', 'comparator-methods.json');

describe('the committed core data and seed', () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    testDb = await createTestDb({ template: 'seeded' });
    sql = testDb.sql;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('hold the value types and units in the order the files list them', async () => {
    const valueTypes = await sql`SELECT id, name FROM value_type ORDER BY position`;
    const units = await sql`SELECT id, name FROM unit ORDER BY position`;

    expect(valueTypes).toEqual(VALUE_TYPES);
    expect(units).toEqual(UNITS);
  });

  it('hold the comparator methods, which each seeded version names by id', async () => {
    const methods = await sql`SELECT id, name FROM comparator_method ORDER BY id`;
    const [unnamed] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM indicator_version v
      WHERE v.comparator_method_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM comparator_method c WHERE c.id = v.comparator_method_id)
    `;

    expect(methods).toEqual([...COMPARATOR_METHODS].sort((a, b) => (a.id < b.id ? -1 : 1)));
    expect(unnamed?.count).toBe(0);
  });

  it('holds each seeded count as count or numerator, as countIsNumerator decides', async () => {
    const indicators = await sql<
      { shortId: number; valueTypeId: string | null; counts: number; numerators: number }[]
    >`
      SELECT i.short_id AS "shortId", v.value_type_id AS "valueTypeId",
             count(o.count)::int AS counts, count(o.numerator)::int AS numerators
      FROM observation o
      JOIN upload_batch b ON b.id = o.upload_batch_id
      JOIN indicator_version v ON v.id = b.indicator_version_id
      JOIN indicator i ON i.id = v.indicator_id
      GROUP BY i.short_id, v.value_type_id
    `;
    const misplaced = indicators.filter(({ shortId, valueTypeId, counts, numerators }) =>
      countIsNumerator(valueTypeId, shortId) ? counts > 0 : numerators > 0,
    );
    const smoking = indicators.find(({ shortId }) => shortId === 92443);

    expect(misplaced).toEqual([]);
    expect(indicators.some(({ numerators }) => numerators > 0)).toBe(true);
    expect(smoking?.counts).toBeGreaterThan(0);
  });
});

describe('upsertOrderedNames', () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    testDb = await createTestDb();
    sql = testDb.sql;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  async function positions() {
    return sql<{ name: string; position: number }[]>`
      SELECT name, position FROM value_type ORDER BY position, name
    `;
  }

  it('orders the rows as the file does, rewrites only what changed and reports strays', async () => {
    const { db } = testDb;
    const [stray] = await sql<{ id: string }[]>`
      INSERT INTO value_type (name, position) VALUES ('A value type no file lists', 0)
      RETURNING id
    `;
    const [first, second, ...rest] = VALUE_TYPES;
    if (!first || !second) throw new Error('the committed file lists too few value types');

    const initial = await upsertOrderedNames(db, valueType, VALUE_TYPES);
    const again = await upsertOrderedNames(db, valueType, VALUE_TYPES);
    const swapped = await upsertOrderedNames(db, valueType, [second, first, ...rest]);

    // The migration's rows all sit at the first position, where the first of them belongs.
    expect(initial.summary).toEqual({ inserted: 0, updated: VALUE_TYPES.length - 1, unchanged: 1 });
    expect(again.summary).toEqual({ inserted: 0, updated: 0, unchanged: VALUE_TYPES.length });
    expect(swapped.summary).toEqual({
      inserted: 0,
      updated: 2,
      unchanged: VALUE_TYPES.length - 2,
    });
    expect(swapped.orphaned).toEqual([{ id: stray?.id, name: 'A value type no file lists' }]);
    expect((await auditEntriesFor(db, first.id)).at(-1)).toEqual(
      expect.objectContaining({
        actorId: SYSTEM_USER_IDS.coreDataImport,
        action: 'value_type.updated',
        changes: { position: { before: 0, after: 1 } },
      }),
    );
    expect((await positions()).slice(0, 3)).toEqual([
      { name: 'A value type no file lists', position: 0 },
      { name: second.name, position: 0 },
      { name: first.name, position: 1 },
    ]);
  });

  it('touches updated_at only on a row it rewrites', async () => {
    const { db } = testDb;
    const stamps = () => sql<{ id: string; stamp: number }[]>`
      SELECT id, extract(epoch FROM updated_at)::float8 AS stamp FROM value_type ORDER BY id
    `;
    const before = await stamps();

    await upsertOrderedNames(db, valueType, VALUE_TYPES);
    const after = await stamps();
    const changed = after.filter((row, index) => row.stamp > (before[index]?.stamp ?? Infinity));

    expect(changed.map(({ id }) => id).sort()).toEqual(
      [VALUE_TYPES[0]?.id, VALUE_TYPES[1]?.id].sort(),
    );
  });
});

describe('upsertComparatorMethods', () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    testDb = await createTestDb();
    sql = testDb.sql;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('inserts, leaves an unchanged method alone, renames a changed one and reports strays', async () => {
    const { db } = testDb;
    const method = { id: '019fa38f-0750-73a5-a5aa-998e2d8982c2', name: 'No comparison' };
    const [stray] = await sql<{ id: string }[]>`
      INSERT INTO comparator_method (name) VALUES ('A method no file lists') RETURNING id
    `;

    const first = await upsertComparatorMethods(db, [method]);
    const again = await upsertComparatorMethods(db, [method]);
    const renamed = await upsertComparatorMethods(db, [{ ...method, name: 'None' }]);

    expect(first.summary).toEqual({ inserted: 1, updated: 0, unchanged: 0 });
    expect(again.summary).toEqual({ inserted: 0, updated: 0, unchanged: 1 });
    expect(renamed.summary).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
    expect(renamed.orphaned).toEqual([{ id: stray?.id, name: 'A method no file lists' }]);
    expect((await auditEntriesFor(db, method.id)).map(({ action }) => action)).toEqual([
      'comparator_method.created',
      'comparator_method.updated',
    ]);
  });
});

describe('loadIndicatorVersions with comparator methods', () => {
  let testDb: TestDb;
  let sql: postgres.Sql;
  let directory: string;
  let indicatorId: string;

  const sourceId = '00000000-0000-7000-8000-00000000c0c0';

  beforeAll(async () => {
    testDb = await createTestDb();
    sql = testDb.sql;
    await importCoreData(sql);
    const [row] = await sql<{ id: string }[]>`INSERT INTO indicator DEFAULT VALUES RETURNING id`;
    indicatorId = row?.id ?? '';
    directory = await mkdtemp(join(tmpdir(), 'fphd-comparator-methods-'));
    await writeFile(
      join(directory, 'ci_method.csv.gz'),
      gzipSync('id,name,description\n00000000-0000-7000-8000-00000000c1c1,Unknown,\n'),
    );
    await writeFile(
      join(directory, 'indicator_version.csv.gz'),
      gzipSync(
        'indicator_id,status,published_at,name,slug,comparator_method_id,created_by,updated_by\n' +
          `${indicatorId},published,2026-01-01T00:00:00Z,A seeded indicator,a-seeded-indicator,${sourceId},${SYSTEM_USER_IDS.pholioMigration},${SYSTEM_USER_IDS.pholioMigration}\n`,
      ),
    );
  });

  afterAll(async () => {
    await testDb.drop();
    await rm(directory, { recursive: true, force: true });
  });

  async function writeComparatorMethod(name: string) {
    await writeFile(
      join(directory, 'comparator_method.csv.gz'),
      gzipSync(`id,name\n${sourceId},"${name}"\n`),
    );
  }

  it('points a version at the core comparator method of the same name', async () => {
    await writeComparatorMethod('Quintiles');

    await sql.begin((tx) => loadIndicatorVersions(tx, directory));
    const rows = await sql<{ name: string }[]>`
      SELECT c.name FROM indicator_version v
      JOIN comparator_method c ON c.id = v.comparator_method_id
      WHERE v.indicator_id = ${indicatorId}
    `;

    expect(rows).toEqual([{ name: 'Quintiles' }]);
    await sql`DELETE FROM indicator_version WHERE indicator_id = ${indicatorId}`;
  });

  it('stops the load at a comparator method the service does not list', async () => {
    await writeComparatorMethod('Deciles');

    await expect(sql.begin((tx) => loadIndicatorVersions(tx, directory))).rejects.toThrow(
      /No core comparator method for Deciles/,
    );
  });
});
