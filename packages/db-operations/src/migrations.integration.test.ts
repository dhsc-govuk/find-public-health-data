import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { beforeEach, describe, expect, it } from 'vitest';

import { readAppliedMigrations, readLocalMigrations } from './migration-status.ts';
import { migrateToLatest } from './migrations.ts';

// Must match MIGRATION_LOCK_KEY in migrations.ts. If it drifts, the lock test stops blocking
// and fails, rather than passing while asserting nothing.
const MIGRATION_LOCK_KEY = 0x6d696772;

let testDb: TestDb;
let sql: postgres.Sql;

// A database per test: two of these deliberately corrupt the migration bookkeeping, and a
// shared one would leave the rest asserting against wreckage.
beforeEach(async () => {
  testDb = await createTestDb();
  sql = testDb.sql;

  return async () => {
    await testDb.drop();
  };
});

async function advisoryLockWaiters(sql: postgres.Sql): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_stat_activity
    WHERE datname = current_database()
      AND wait_event_type = 'Lock' AND wait_event = 'advisory'
  `;
  return rows[0]?.count ?? 0;
}

function poolOf(size: number): postgres.Sql {
  return testDb.connect({ max: size });
}

describe('migrateToLatest', () => {
  it('is a no-op against a database already at the latest migration', async () => {
    await migrateToLatest(sql);

    expect(await readAppliedMigrations(sql)).toHaveLength(readLocalMigrations().length);
  });

  it('refuses a client that could run its statements on more than one session', async () => {
    await expect(migrateToLatest(poolOf(2))).rejects.toThrow(/max: 1/);
  });

  it('refuses a migration edited since it was applied', async () => {
    await sql`
      UPDATE drizzle.__drizzle_migrations SET hash = 'edited-since-it-was-applied'
      WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations)
    `;

    await expect(migrateToLatest(sql)).rejects.toThrow(/tampered/);
  });

  // Drizzle's migrator applies anything newer than the single newest recorded row, so an
  // unrecorded older migration is passed over on every run without an error. Dropping all but
  // the newest row reproduces that shape against the real migrations folder.
  it('refuses a migration that would be silently passed over', async () => {
    await sql`
      DELETE FROM drizzle.__drizzle_migrations
      WHERE created_at < (SELECT max(created_at) FROM drizzle.__drizzle_migrations)
    `;

    await expect(migrateToLatest(sql)).rejects.toThrow(/skipped/);
  });

  it('waits for a migration already in progress rather than racing it', async () => {
    const holder = testDb.connect({ max: 1 });
    await holder`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`;

    let settled = false;
    const migrating = migrateToLatest(sql).then(() => {
      settled = true;
    });

    // Blocked, not merely slow: the migrator's session must show up waiting on the
    // advisory lock before the release half of the test means anything.
    await expect.poll(() => advisoryLockWaiters(holder)).toBeGreaterThan(0);
    expect(settled, 'migrated while another session held the lock').toBe(false);

    await holder`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    await migrating;
    await holder.end();

    expect(settled).toBe(true);
  });

  it('releases the lock, so a later run is not blocked by an earlier one', async () => {
    await migrateToLatest(sql);
    await migrateToLatest(sql);

    const held = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM pg_locks
      WHERE locktype = 'advisory' AND objid = ${MIGRATION_LOCK_KEY}
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
    `;
    expect(held[0]?.count).toBe(0);
  });
});
