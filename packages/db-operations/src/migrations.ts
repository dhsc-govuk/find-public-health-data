import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type postgres from 'postgres';

import {
  assertMigratable,
  compareMigrations,
  migrationsFolder,
  readAppliedMigrations,
  readLocalMigrations,
} from './migration-status.ts';
import { OWNER_GROUP, prepareOwnerGroup } from './owner-group.ts';

export { migrationsFolder };

// Distinct from the test harness's copy lock: these serialise different things and a shared
// key would have a migration wait on a database copy.
const MIGRATION_LOCK_KEY = 0x6d696772; // 'migr'

/**
 * A plain `finally` would let a failing teardown replace the error that caused it — a dead
 * connection rejects the unlock too, and the job would log the teardown instead of the
 * migration that failed. The teardown error only propagates when the work itself succeeded.
 */
export async function withTeardown<T>(
  run: () => Promise<T>,
  teardown: () => Promise<unknown>,
): Promise<T> {
  let result: T;
  try {
    result = await run();
  } catch (error) {
    await teardown().catch(() => {});
    throw error;
  }
  await teardown();
  return result;
}

/**
 * Applies pending migrations, as the owner group (`asOwnerGroup`), through drizzle-orm's
 * migrator rather than `drizzle-kit migrate`, so the deployed path needs no devDependency: drizzle-kit is a build-time tool
 * and is absent from a production install.
 *
 * Two things wrap that call. The advisory lock, because the migrator reads its watermark
 * outside the transaction it then applies in, so two concurrent jobs both see the same
 * starting point and the second fails partway through. It blocks rather than failing fast —
 * the job that waits goes on to find nothing pending, which is the right outcome.
 *
 * And the pre-flight, because the states it refuses are ones the migrator reports success on
 * having applied nothing at all.
 */
export async function migrateToLatest(sql: postgres.Sql): Promise<void> {
  if (sql.options.max !== 1) {
    throw new Error(
      `migrateToLatest needs a client with max: 1, got ${sql.options.max} — the advisory lock binds to a single session`,
    );
  }

  await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
  await withTeardown(
    async () => {
      assertMigratable(compareMigrations(readLocalMigrations(), await readAppliedMigrations(sql)));
      await asOwnerGroup(sql, () => migrate(drizzle(sql), { migrationsFolder }));
    },
    () => sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`,
  );
}

/**
 * Runs `work` as the owner group, so what it creates belongs to the group whichever login is
 * connected (see `prepareOwnerGroup`). The role is reset afterwards, so a caller that goes on
 * to use the client is back as itself.
 */
export async function asOwnerGroup<T>(sql: postgres.Sql, work: () => Promise<T>): Promise<T> {
  if (sql.options.max !== 1) {
    throw new Error(
      `asOwnerGroup needs a client with max: 1, got ${sql.options.max} — SET ROLE binds to a single session`,
    );
  }
  await prepareOwnerGroup(sql);
  await sql`SET ROLE ${sql(OWNER_GROUP)}`;
  return withTeardown(work, () => sql`RESET ROLE`);
}
