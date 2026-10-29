import { createOwnerClient, createTestDatabase } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import { createCapturingLogger } from '@fphd/logger/testing';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, describe, expect, it } from 'vitest';

import { addFallbackHandlers, createApiApp } from './index.ts';

const MARKER = 'marker-7d41a0';

const testDb = await createTestDatabase();
const client = createOwnerClient(testDb.name);
const db = drizzle(client);

afterAll(async () => {
  await client.end();
  await testDb.drop();
});

describe('addFallbackHandlers', () => {
  it("logs a failed query's Postgres code and none of its parameters", async () => {
    const { logger, lines } = createCapturingLogger('test-api');
    const app = createApiApp({ logger, serviceName: 'test-api' });
    app.get('/api/failing', async () => {
      await db.execute(sql`SELECT ${MARKER}::text, 1 / 0`);
    });
    addFallbackHandlers(app);

    const response = await request(app).get('/api/failing');
    await new Promise((resolve) => setImmediate(resolve));

    expect(response.status).toBe(500);
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain(MARKER);
    expect(lines[0]).toMatchObject({
      err: { type: 'DrizzleQueryError', cause: { code: '22012', severity: 'ERROR' } },
    });
  });
});
