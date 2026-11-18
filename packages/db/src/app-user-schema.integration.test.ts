import type postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { SYSTEM_USER_IDS } from './schema/index.ts';
import { createTestDb, type TestDb } from './testing.ts';

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

it('holds every system user under its fixed id', async () => {
  const rows = await sql<{ id: string }[]>`SELECT id FROM app_user WHERE kind = 'system'`;

  expect(rows.map(({ id }) => id).sort()).toEqual(Object.values(SYSTEM_USER_IDS).sort());
});

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
