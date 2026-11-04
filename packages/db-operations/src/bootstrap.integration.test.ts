import { randomBytes } from 'node:crypto';

import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bootstrapEntraPrincipals, bootstrapRoles } from './bootstrap.ts';

let testDb: TestDb;
let owner: postgres.Sql;

// Login roles are cluster-wide, not per-database, so this file must never bootstrap
// public_api or internal_api: that would rotate the passwords the rest of the suite and the
// developer's compose stack are connecting with. Each test gets a name of its own instead,
// which also keeps the tests independent of the order they run in.
const createdRoles: string[] = [];

function uniqueRoleName(): string {
  const name = `fphd_bootstrap_test_${randomBytes(6).toString('hex')}`;
  createdRoles.push(name);
  return name;
}

async function canLogIn(role: string, password: string): Promise<boolean> {
  const sql = testDb.connect({ login: { user: role, password }, max: 1 });
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end();
  }
}

beforeAll(async () => {
  testDb = await createTestDb();
  owner = testDb.sql;
  // Stands in for Azure's function, which creates a login role mapped to the Entra object.
  await owner.unsafe(`
    CREATE TABLE created_principals (role_name text, object_id text, object_type text);
    CREATE FUNCTION pgaadauth_create_principal_with_oid(
      role_name text, object_id text, object_type text, is_admin boolean, is_mfa boolean
    ) RETURNS text LANGUAGE plpgsql AS $$
    BEGIN
      EXECUTE format('CREATE ROLE %I LOGIN', role_name);
      INSERT INTO created_principals VALUES (role_name, object_id, object_type);
      RETURN 'Created role for ' || role_name;
    END $$;
  `);
});

afterAll(async () => {
  // Principals before groups, so no group is dropped while it still has members.
  for (const role of createdRoles.toReversed()) {
    await owner.unsafe(`DROP ROLE IF EXISTS "${role}"`);
  }
  await testDb.drop();
});

describe('bootstrapRoles', () => {
  it('creates a login role that authenticates with the given password', async () => {
    const role = uniqueRoleName();

    await bootstrapRoles(owner, [{ name: role, password: 'a-password' }]);

    expect(await canLogIn(role, 'a-password')).toBe(true);
  });

  it('leaves an existing role in place when run again', async () => {
    const role = uniqueRoleName();

    await bootstrapRoles(owner, [{ name: role, password: 'a-password' }]);
    await bootstrapRoles(owner, [{ name: role, password: 'a-password' }]);

    const rows = await owner`SELECT rolname FROM pg_roles WHERE rolname = ${role}`;
    expect(rows).toHaveLength(1);
    expect(await canLogIn(role, 'a-password')).toBe(true);
  });

  it('rotates the password of an existing role', async () => {
    const role = uniqueRoleName();

    await bootstrapRoles(owner, [{ name: role, password: 'old-password' }]);
    await bootstrapRoles(owner, [{ name: role, password: 'new-password' }]);

    expect(await canLogIn(role, 'new-password')).toBe(true);
    expect(await canLogIn(role, 'old-password')).toBe(false);
  });

  it('accepts a password containing quotes, backslashes and SQL punctuation', async () => {
    const role = uniqueRoleName();
    const awkward = String.raw`o'brien "quoted" \ ; --`;

    await bootstrapRoles(owner, [{ name: role, password: awkward }]);

    expect(await canLogIn(role, awkward)).toBe(true);
  });

  it('bootstraps every role it is given', async () => {
    const roles = [
      { name: uniqueRoleName(), password: 'first' },
      { name: uniqueRoleName(), password: 'second' },
    ];

    await bootstrapRoles(owner, roles);

    for (const role of roles) {
      expect(await canLogIn(role.name, role.password)).toBe(true);
    }
  });
});

describe('bootstrapEntraPrincipals', () => {
  const objectId = '22222222-2222-2222-2222-222222222222';

  async function roleFlags(role: string): Promise<{ canLogin: boolean } | undefined> {
    const [row] = await owner<{ canLogin: boolean }[]>`
      SELECT rolcanlogin AS "canLogin" FROM pg_roles WHERE rolname = ${role}
    `;
    return row;
  }

  async function isMember(member: string, group: string): Promise<boolean> {
    const [row] = await owner<{ member: boolean }[]>`
      SELECT pg_has_role(${member}, ${group}, 'USAGE') AS member
    `;
    return row?.member ?? false;
  }

  it('creates the principal from its object ID and adds it to a group that cannot log in', async () => {
    const group = uniqueRoleName();
    const name = uniqueRoleName();

    await bootstrapEntraPrincipals(owner, [{ group, name, objectId }]);

    expect(await owner`SELECT * FROM created_principals WHERE role_name = ${name}`).toEqual([
      { role_name: name, object_id: objectId, object_type: 'service' },
    ]);
    expect(await roleFlags(group)).toEqual({ canLogin: false });
    expect(await isMember(name, group)).toBe(true);
  });

  it('leaves an existing principal alone when run again', async () => {
    const group = uniqueRoleName();
    const name = uniqueRoleName();

    await bootstrapEntraPrincipals(owner, [{ group, name, objectId }]);
    await bootstrapEntraPrincipals(owner, [{ group, name, objectId }]);

    const created = await owner`SELECT 1 FROM created_principals WHERE role_name = ${name}`;
    expect(created).toHaveLength(1);
    expect(await isMember(name, group)).toBe(true);
  });

  it('stops a group that was a password login from logging in', async () => {
    const group = uniqueRoleName();
    await bootstrapRoles(owner, [{ name: group, password: 'a-password' }]);

    await bootstrapEntraPrincipals(owner, [{ group, name: uniqueRoleName(), objectId }]);

    expect(await roleFlags(group)).toEqual({ canLogin: false });
    expect(await canLogIn(group, 'a-password')).toBe(false);
  });
});
