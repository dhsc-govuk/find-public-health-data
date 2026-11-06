import { fakeUsers } from '@fphd/auth';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Migration 0047 inserted a public-only fake user who has since gone from the fake users. The row
// stays, as migrations don't rewrite data, for anything that names them.
const RETIRED_FAKE_USERS = [
  { id: '01a13c69-96ac-700c-9c28-8f3a1d3968e2', displayName: 'Alex Morgan' },
];

describe('the fake users after every migration', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('gives every fake user a person row with their id and name', async () => {
    const rows = await testDb.sql<{ id: string; displayName: string }[]>`
      SELECT id, display_name AS "displayName" FROM app_user WHERE kind = 'person'
    `;

    const expected = [
      ...fakeUsers.map(({ id, name }) => ({ id, displayName: name })),
      ...RETIRED_FAKE_USERS,
    ];

    expect(rows).toEqual(expect.arrayContaining(expected));
    expect(rows).toHaveLength(expected.length);
  });
});
