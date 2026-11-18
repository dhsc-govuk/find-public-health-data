import { fakeUsers, TEAMS } from '@fphd/auth';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { upsertFakeUsers } from './fake-users-core-data.ts';

describe('upsertFakeUsers', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  it('inserts every team and fake person under their fixed ids', async () => {
    // The migration already holds Fingertips, so the import finds it unchanged.
    expect(await upsertFakeUsers(testDb.db)).toEqual({
      teams: { inserted: TEAMS.length - 1, updated: 0, unchanged: 1 },
      users: { inserted: fakeUsers.length, updated: 0, unchanged: 0 },
    });

    const teams = await testDb.sql`SELECT id, name FROM team ORDER BY id`;
    const people = await testDb.sql`
      SELECT id, display_name AS name FROM app_user WHERE kind = 'person' ORDER BY id
    `;
    const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);
    expect(teams).toEqual(TEAMS.map(({ id, name }) => ({ id, name })).sort(byId));
    expect(people).toEqual(fakeUsers.map(({ id, name }) => ({ id, name })).sort(byId));
  });

  it('changes nothing when run again', async () => {
    expect(await upsertFakeUsers(testDb.db)).toEqual({
      teams: { inserted: 0, updated: 0, unchanged: TEAMS.length },
      users: { inserted: 0, updated: 0, unchanged: fakeUsers.length },
    });
  });
});
