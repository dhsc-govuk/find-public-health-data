import { fakeUsers } from '@fphd/auth';
import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateBefore, migrateThrough } from './testing.ts';

const { SYSTEM_USER_IDS } = schema;

const MIGRATION = '0047_users';

const PUBLISHER = '01a13c69-96ab-7598-9ce0-f84dbec3d5dd';
const ADMIN = '01a13c69-96ac-700c-9c28-8a01ee1fdfa8';

let shortId = 0;

/** A version written by one actor and updated by another, and a batch uploaded by a third. */
async function recordsBy(
  sql: postgres.Sql,
  createdBy: string,
  updatedBy: string,
  uploadedBy: string,
): Promise<{ versionId: string; batchId: string }> {
  shortId += 1;
  const [version] = await sql<{ id: string; indicatorId: string }[]>`
    WITH created AS (INSERT INTO indicator (short_id) VALUES (${shortId}) RETURNING id)
    INSERT INTO indicator_version (indicator_id, name, slug, created_by, updated_by)
    SELECT created.id, ${`Indicator ${shortId}`}, ${`indicator-${shortId}`}, ${createdBy},
           ${updatedBy}
    FROM created
    RETURNING id, indicator_id AS "indicatorId"
  `;
  if (!version) throw new Error('inserted no version');
  const [batch] = await sql<{ id: string }[]>`
    INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by)
    VALUES (${version.indicatorId}, ${version.id}, 'data.csv', ${uploadedBy})
    RETURNING id
  `;
  if (!batch) throw new Error('inserted no batch');
  return { versionId: version.id, batchId: batch.id };
}

async function beforeMigration(): Promise<[TestDb, postgres.Sql]> {
  const testDb = await createTestDb({ template: 'unmigrated' });
  const sql = testDb.sql;
  await migrateBefore(sql, MIGRATION);
  return [testDb, sql];
}

describe(`migration ${MIGRATION}`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;
  let records: { versionId: string; batchId: string };

  beforeAll(async () => {
    [testDb, sql] = await beforeMigration();
    records = await recordsBy(sql, PUBLISHER, ADMIN, SYSTEM_USER_IDS.testSeed);
    await migrateThrough(sql, MIGRATION);
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('inserts the system users and a person for each fake user, with their ids', async () => {
    const rows = await sql<{ id: string; displayName: string; kind: string }[]>`
      SELECT id, display_name AS "displayName", kind FROM app_user
    `;

    expect(rows).toHaveLength(fakeUsers.length + 2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: SYSTEM_USER_IDS.pholioMigration, displayName: 'PHOLIO migration', kind: 'system' },
        { id: SYSTEM_USER_IDS.testSeed, displayName: 'Test seed', kind: 'system' },
        ...fakeUsers.map(({ id, name }) => ({ id, displayName: name, kind: 'person' })),
      ]),
    );
  });

  it('keeps an actor that is a user id as that user', async () => {
    const [version] = await sql`
      SELECT created_by, updated_by FROM indicator_version WHERE id = ${records.versionId}
    `;
    const [batch] = await sql`SELECT uploaded_by FROM upload_batch WHERE id = ${records.batchId}`;

    expect(version).toEqual({ created_by: PUBLISHER, updated_by: ADMIN });
    expect(batch).toEqual({ uploaded_by: SYSTEM_USER_IDS.testSeed });
  });

  it("drops the observation's writer, which its batch's uploader records", async () => {
    const columns = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'observation' AND column_name = 'created_by'
    `;

    expect(columns).toHaveLength(0);
  });

  it('refuses an actor no user stands for', async () => {
    await expect(
      sql`UPDATE indicator_version SET updated_by = uuidv7() WHERE id = ${records.versionId}`,
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe(`migration ${MIGRATION} over an actor that is not a user id`, () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    [testDb, sql] = await beforeMigration();
    await recordsBy(sql, 'pholio-migration', 'pholio-migration', 'pholio-migration');
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('stops', async () => {
    await expect(migrateThrough(sql, MIGRATION)).rejects.toMatchObject({
      cause: expect.objectContaining({ code: '22P02' }),
    });
  });
});

describe('app_user', () => {
  let testDb: TestDb;
  let sql: postgres.Sql;

  beforeAll(async () => {
    testDb = await createTestDb();
    sql = testDb.sql;
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  function insertUser(kind: string, issuer: string | null, subject: string | null) {
    return sql`
      INSERT INTO app_user (display_name, kind, oidc_issuer, oidc_subject)
      VALUES ('A user', ${kind}, ${issuer}, ${subject})
    `;
  }

  it('holds a person with an OpenID Connect identity', async () => {
    await expect(insertUser('person', 'https://issuer.test', 'subject-1')).resolves.toBeDefined();
  });

  it('refuses a second user with the same identity', async () => {
    await insertUser('person', 'https://issuer.test', 'subject-2');

    await expect(insertUser('person', 'https://issuer.test', 'subject-2')).rejects.toMatchObject({
      code: '23505',
    });
  });

  it.each([
    ['an issuer without a subject', 'person', 'https://issuer.test', null],
    ['a subject without an issuer', 'person', null, 'subject-3'],
    ['a system user with an identity', 'system', 'https://issuer.test', 'subject-4'],
    ['a kind it does not know', 'robot', null, null],
  ])('refuses %s', async (_case, kind, issuer, subject) => {
    await expect(insertUser(kind, issuer, subject)).rejects.toMatchObject({ code: '23514' });
  });
});
