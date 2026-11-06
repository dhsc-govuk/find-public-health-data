import { createTestDb } from '@fphd/db/testing';
import { publishDueVersions } from '@fphd/internal-workflow';
import { createLogger } from '@fphd/logger';
import { afterAll, describe, expect, it } from 'vitest';

// config.ts parses the environment at import, so POSTGRES_DB must point at this file's own
// database before db.ts is imported. The global setup has already loaded the repo .env.
const testDb = await createTestDb({ template: 'seeded' });
process.env.POSTGRES_DB = testDb.name;

const { db } = await import('./db.ts');

afterAll(async () => {
  await testDb.drop();
});

describe('worker database connection', () => {
  it('connects as the internal_api role', async () => {
    const [row] = await db.$client<{ user: string }[]>`SELECT current_user AS user`;
    expect(row?.user).toBe('internal_api');
  });

  it('sweeps the seed, where nothing is due', async () => {
    const logger = createLogger({ name: 'internal-worker', level: 'silent' });

    expect(await publishDueVersions(db, logger)).toEqual({
      published: 0,
      failed: 0,
      blocked: false,
      overdue: 0,
    });
  });
});
