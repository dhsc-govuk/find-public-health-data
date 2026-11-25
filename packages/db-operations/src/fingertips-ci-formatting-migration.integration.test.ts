import { apiLogin, createTestDb, type TestDb } from '@fphd/db/testing';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { migrateThrough } from './testing.ts';

let database: TestDb;

beforeAll(async () => {
  database = await createTestDb({ template: 'unmigrated' });
  await migrateThrough(database.sql, '0099_fingertips-ci-formatting');
});

afterAll(async () => {
  await database.drop();
});

it.each(['public_api', 'internal_api'] as const)(
  'lets %s read the replaced indicator view without the migration wrapper',
  async (role) => {
    const reader = database.connect({ login: apiLogin(role) });
    await expect(reader`SELECT fingertips_formatting FROM published.indicator`).resolves.toEqual(
      [],
    );
  },
);
