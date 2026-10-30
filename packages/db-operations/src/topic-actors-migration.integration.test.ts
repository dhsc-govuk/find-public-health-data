import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateBefore, migrateThrough } from './testing.ts';

const { SYSTEM_USER_IDS } = schema;

const MIGRATION = '0048_topic-actors';

describe(`migration ${MIGRATION}`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;
  let topicId: string;

  beforeAll(async () => {
    testDb = await createTestDb({ template: 'unmigrated' });
    sql = testDb.sql;
    await migrateBefore(sql, MIGRATION);
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO topic (slug, title, description) VALUES ('older', 'Older', 'From before.')
      RETURNING id
    `;
    topicId = row?.id ?? '';
    await migrateThrough(sql, MIGRATION);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('inserts the core data import as a system user', async () => {
    const rows = await sql`
      SELECT display_name, kind FROM app_user WHERE id = ${SYSTEM_USER_IDS.coreDataImport}
    `;

    expect(rows).toEqual([{ display_name: 'Core data import', kind: 'system' }]);
  });

  it('attributes an existing topic to the core data import', async () => {
    const [row] = await sql`SELECT created_by, updated_by FROM topic WHERE id = ${topicId}`;

    expect(row).toEqual({
      created_by: SYSTEM_USER_IDS.coreDataImport,
      updated_by: SYSTEM_USER_IDS.coreDataImport,
    });
  });

  it('refuses a topic without a writer', async () => {
    await expect(
      sql`INSERT INTO topic (slug, title, description) VALUES ('new', 'New', 'No writer.')`,
    ).rejects.toMatchObject({ code: '23502' });
  });
});
