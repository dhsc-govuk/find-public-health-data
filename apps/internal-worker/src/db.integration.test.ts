import { createTestDb } from '@fphd/db/testing';
import { publishDueVersions } from '@fphd/internal-workflow';
import { createLogger } from '@fphd/logger';
import { afterAll, describe, expect, it } from 'vitest';

// config.ts parses the environment when it is first imported, so POSTGRES_DB must name this
// file's own test database before db.ts, which imports config.ts, is imported. The global test
// setup has already loaded the repository's .env file.
const testDb = await createTestDb({ template: 'core' });
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

  it('sweeps a database where nothing is due', async () => {
    const logger = createLogger({ name: 'internal-worker', level: 'silent' });

    expect(await publishDueVersions(db, logger)).toEqual({
      published: 0,
      failed: 0,
      blocked: false,
      overdue: 0,
    });
  });
});
