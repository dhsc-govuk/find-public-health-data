import { randomBytes } from 'node:crypto';

import { createOwnerClient, createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

import { asOwnerGroup, migrateToLatest } from './migrations.ts';
import { APP_SCHEMAS, OWNER_GROUP } from './owner-group.ts';
import { resetDatabase } from './reset.ts';

/**
 * Every object in the application schemas, of every kind that has an owner, whose owner is
 * not the group: a wider net than the relations `prepareOwnerGroup` checks. Extension members,
 * and array types over them, belong to the extension.
 */
async function notOwnedByGroup(sql: postgres.Sql): Promise<string[]> {
  const rows = await sql<{ object: string }[]>`
    WITH app AS (SELECT oid FROM pg_namespace WHERE nspname = ANY(${APP_SCHEMAS}::text[])),
    extension_members AS (SELECT classid, objid FROM pg_depend WHERE deptype = 'e')
    SELECT 'schema ' || nspname AS object FROM pg_namespace
    WHERE nspname = ANY(${APP_SCHEMAS.filter((name) => name !== 'public')}::text[])
      AND nspowner <> ${OWNER_GROUP}::regrole
    UNION ALL
    SELECT 'relation ' || c.oid::regclass FROM pg_class c JOIN app ON app.oid = c.relnamespace
    WHERE c.relowner <> ${OWNER_GROUP}::regrole
      AND (('pg_class'::regclass, c.oid) NOT IN (SELECT classid, objid FROM extension_members))
    UNION ALL
    SELECT 'function ' || p.oid::regprocedure FROM pg_proc p JOIN app ON app.oid = p.pronamespace
    WHERE p.proowner <> ${OWNER_GROUP}::regrole
      AND (('pg_proc'::regclass, p.oid) NOT IN (SELECT classid, objid FROM extension_members))
    UNION ALL
    SELECT 'type ' || t.oid::regtype FROM pg_type t JOIN app ON app.oid = t.typnamespace
    WHERE t.typowner <> ${OWNER_GROUP}::regrole
      AND (('pg_type'::regclass, t.oid) NOT IN (SELECT classid, objid FROM extension_members))
      AND (('pg_type'::regclass, t.typelem) NOT IN (SELECT classid, objid FROM extension_members))
    ORDER BY 1
  `;
  return rows.map(({ object }) => object);
}

const databases: TestDb[] = [];
const createdRoles: string[] = [];

async function newDatabase(template?: 'unmigrated'): Promise<TestDb> {
  const testDb = await createTestDb(template ? { template } : {});
  databases.push(testDb);
  return testDb;
}

afterAll(async () => {
  for (const testDb of databases) await testDb.drop();
  const admin = createOwnerClient('postgres');
  try {
    for (const role of createdRoles) {
      await admin.unsafe(`REVOKE ${OWNER_GROUP} FROM "${role}" CASCADE`);
      await admin.unsafe(`DROP ROLE IF EXISTS "${role}"`);
    }
  } finally {
    await admin.end();
  }
});

describe('migrateToLatest and the owner group', () => {
  it('leaves every object in a freshly migrated database owned by the group', async () => {
    const { sql } = await newDatabase();

    expect(await notOwnedByGroup(sql)).toEqual([]);
  });

  it('refuses a database migrated before the group, and says to reset it', async () => {
    const { sql } = await newDatabase('unmigrated');
    await sql`CREATE TABLE left_over (id int)`;

    await expect(migrateToLatest(sql)).rejects.toThrow(/left_over.*pnpm db:reset/);
  });

  it('refuses a client that could run its statements on more than one session', async () => {
    const testDb = await newDatabase();

    await expect(asOwnerGroup(testDb.connect({ max: 2 }), async () => {})).rejects.toThrow(
      /max: 1/,
    );
  });

  it('gives the group what it needs again after a reset drops the public schema', async () => {
    const { sql } = await newDatabase();

    await resetDatabase(sql);
    await migrateToLatest(sql);

    expect(await notOwnedByGroup(sql)).toEqual([]);
    const [privilege] = await sql<{ create: boolean }[]>`
      SELECT has_schema_privilege(${OWNER_GROUP}, 'public', 'CREATE') AS create
    `;
    expect(privilege?.create).toBe(true);
  });

  // Closer to the deployed shape: the login is not a superuser and owns the database. The
  // test run has already created the group, so the login can't create it. Instead it gets
  // what Postgres 16+ gives a non-superuser that creates a role: ADMIN and nothing more.
  describe('as a non-superuser admin login', () => {
    // Capitals and a dot, as an Entra user's name has, so the name needs quoting.
    const login = `Fphd.Owner_Test_${randomBytes(6).toString('hex')}`;
    const password = 'owner-group-test';

    async function databaseOwnedByLogin(): Promise<{ admin: postgres.Sql; asLogin: postgres.Sql }> {
      const testDb = await newDatabase('unmigrated');
      const admin = testDb.sql;
      if (!createdRoles.includes(login)) {
        createdRoles.push(login);
        await admin.unsafe(`CREATE ROLE "${login}" LOGIN CREATEROLE PASSWORD '${password}'`);
        await admin.unsafe(
          `GRANT ${OWNER_GROUP} TO "${login}" WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`,
        );
      }
      await admin.unsafe(`ALTER DATABASE "${testDb.name}" OWNER TO "${login}"`);
      return { admin, asLogin: testDb.connect({ login: { user: login, password }, max: 1 }) };
    }

    it('migrates an empty database, extensions included', async () => {
      const { admin, asLogin } = await databaseOwnedByLogin();

      await migrateToLatest(asLogin);

      expect(await notOwnedByGroup(admin)).toEqual([]);
    });

    it('hands the session back as the login', async () => {
      const { asLogin } = await databaseOwnedByLogin();

      await migrateToLatest(asLogin);

      const [session] = await asLogin<{ user: string }[]>`SELECT current_user AS user`;
      expect(session?.user).toBe(login);
    });
  });
});
