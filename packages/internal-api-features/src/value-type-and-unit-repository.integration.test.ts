import type { Database } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listValueTypeAndUnitOptions } from './value-type-and-unit-repository.ts';

let testDb: TestDb;
let db: Database;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  // Each list in reverse order of id, which no order by name or id would give.
  for (const table of ['value_type', 'unit']) {
    await db.execute(sql`
      UPDATE ${sql.identifier(table)} t SET position = r.position
      FROM (
        SELECT id, (row_number() OVER (ORDER BY id DESC))::smallint AS position
        FROM ${sql.identifier(table)}
      ) r
      WHERE r.id = t.id
    `);
  }
});

afterAll(async () => {
  await testDb.drop();
});

describe('listValueTypeAndUnitOptions', () => {
  it('lists every value type and unit by position, as the form does', async () => {
    const { valueTypes, units } = await listValueTypeAndUnitOptions(db);
    const ids = (options: { id: string }[]) => options.map(({ id }) => id);
    const descending = (values: string[]) => [...values].sort().reverse();

    expect(valueTypes.length).toBeGreaterThan(1);
    expect(ids(valueTypes)).toEqual(descending(ids(valueTypes)));
    expect(ids(units)).toEqual(descending(ids(units)));
  });
});
