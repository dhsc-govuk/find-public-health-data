import { schema } from '@fphd/db';
import { createTestDb } from '@fphd/db/testing';
import { afterAll, describe, expect, it } from 'vitest';

// config.ts parses the environment at import, so POSTGRES_DB must point at this file's own
// database before db.ts is imported. The global setup has already loaded the repo .env.
const testDb = await createTestDb({ template: 'seeded' });
process.env.POSTGRES_DB = testDb.name;

const { db } = await import('./db.ts');

afterAll(async () => {
  await testDb.drop();
});

describe('internal API database connection', () => {
  it('reads the seeded schema as the internal_api role', async () => {
    const indicators = await db.select({ id: schema.indicator.id }).from(schema.indicator);
    expect(indicators).toHaveLength(12);
  });

  it('cannot write reference data such as value types', async () => {
    await expect(
      db.insert(schema.valueType).values({ name: 'integration-test-denied', position: 0 }),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it('can read operational upload data, unlike the public role', async () => {
    const batches = await db.select({ id: schema.uploadBatch.id }).from(schema.uploadBatch);
    expect(batches).toHaveLength(12);
  });
});
