import { fakeUsers } from '@fphd/auth';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

    expect(rows).toEqual(
      expect.arrayContaining(fakeUsers.map(({ id, name }) => ({ id, displayName: name }))),
    );
    expect(rows).toHaveLength(fakeUsers.length);
  });
});
