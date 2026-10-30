import { randomBytes } from 'node:crypto';

import { parseEnv, z } from '@fphd/config';
import { asc, eq, getTableColumns, type Table } from 'drizzle-orm';
import type postgres from 'postgres';

import { createDbFromClient, createPostgresClient, type Database } from './client.ts';
import { resolveDbTls } from './env.ts';
import type { Repositories } from './repositories.ts';
import { auditLog } from './schema/index.ts';
import { createOwnerClient, loadOwnerEnv } from './scripts/owner-client.ts';

export { createOwnerClient, loadOwnerEnv } from './scripts/owner-client.ts';

/**
 * Two templates, because most integration tests do not want the seed. Copying `seeded`
 * duplicates ~490k observations and ~759k bridge rows; a test that only exercises the
 * topics table should not pay for that. `@fphd/db-operations/testing` builds them.
 */
export type TestTemplate = 'schema' | 'seeded';

export const TEST_DATABASE_PREFIX = 'fphd_test_';

/**
 * Names the integration run in progress. The global setup sets it before any test file
 * starts, and every database the run creates carries it, so runs sharing a Postgres server
 * (two worktrees, say) never copy, drop or clean up one another's databases.
 */
export const TEST_RUN_ENV = 'FPHD_TEST_RUN';

/** A run id: the start time in Unix seconds, so a later run can tell leftovers by age. */
export function newTestRun(now: Date = new Date()): string {
  return `${Math.floor(now.getTime() / 1000)}_${randomBytes(3).toString('hex')}`;
}

export function templateName(run: string, template: TestTemplate): string {
  return `${TEST_DATABASE_PREFIX}${run}_${template}`;
}

function testDatabaseName(run: string): string {
  return `${TEST_DATABASE_PREFIX}${run}_${randomBytes(6).toString('hex')}`;
}

const RUN_NAME = new RegExp(`^${TEST_DATABASE_PREFIX}(\\d+)_[0-9a-f]+_`);

/** The time the run that created a test database started, or undefined for any other name. */
function runStartedAt(name: string): Date | undefined {
  const seconds = RUN_NAME.exec(name)?.[1];
  return seconds === undefined ? undefined : new Date(Number(seconds) * 1000);
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * The test databases a new run may drop: those left by a run that started over a day ago,
 * which no integration run lasts, and those named before runs had ids. A run that is
 * interrupted leaves its databases behind until then.
 */
export function staleTestDatabases(names: readonly string[], now: Date = new Date()): string[] {
  return names.filter((name) => {
    if (!name.startsWith(TEST_DATABASE_PREFIX)) return false;
    const startedAt = runStartedAt(name);
    return startedAt === undefined || now.getTime() - startedAt.getTime() > STALE_AFTER_MS;
  });
}

/** Every database the given run created, templates included. */
export function runTestDatabases(names: readonly string[], run: string): string[] {
  return names.filter((name) => name.startsWith(`${TEST_DATABASE_PREFIX}${run}_`));
}

function currentTestRun(): string {
  // biome-ignore lint/style/noProcessEnv: set by the integration tier's global setup
  const run = process.env[TEST_RUN_ENV];
  if (!run) {
    throw new Error(
      `${TEST_RUN_ENV} is not set. Run integration tests with pnpm test:integration, whose global setup builds this run's templates.`,
    );
  }
  return run;
}

/**
 * Postgres refuses `CREATE DATABASE ... TEMPLATE` while any other session is connected to
 * the template, so concurrent copies must take turns. An advisory lock makes them queue;
 * the previous approach raced and retried on the resulting error, which cannot be made
 * reliable — it only shifts how long you wait before failing. The lock is per run, since
 * each run copies from templates of its own.
 */
const COPY_LOCK_KEY = 0x66706864; // 'fphd'

async function withCopyLock<T>(
  admin: postgres.Sql,
  run: string,
  copy: () => Promise<T>,
): Promise<T> {
  await admin`SELECT pg_advisory_lock(${COPY_LOCK_KEY}::int, hashtext(${run}))`;
  try {
    return await copy();
  } finally {
    await admin`SELECT pg_advisory_unlock(${COPY_LOCK_KEY}::int, hashtext(${run}))`;
  }
}

export interface TestLogin {
  user: string;
  password: string;
}

/**
 * The per-API login roles, with the passwords the repo .env or CI gives them. Login roles
 * are cluster-wide, so these work against any test database.
 */
export function apiLogin(role: 'public_api' | 'internal_api'): TestLogin {
  const env = parseEnv(
    z.object({
      PUBLIC_API_PASSWORD: z.string().default('public_api'),
      INTERNAL_API_PASSWORD: z.string().default('internal_api'),
    }),
    // biome-ignore lint/style/noProcessEnv: the test harness reads the same env as loadOwnerEnv
    process.env,
  );
  return {
    user: role,
    password: role === 'public_api' ? env.PUBLIC_API_PASSWORD : env.INTERNAL_API_PASSWORD,
  };
}

export interface TestConnectOptions {
  /** The owner role when omitted. */
  login?: TestLogin;
  /** postgres.js's own default (10) when omitted. */
  max?: number;
}

function connectTo(database: string, { login, max }: TestConnectOptions = {}): postgres.Sql {
  const env = loadOwnerEnv();
  return createPostgresClient(
    {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database,
      user: login?.user ?? env.POSTGRES_USER,
      password: login?.password ?? env.POSTGRES_PASSWORD,
      ssl: resolveDbTls(env.APP_ENV, env.DB_TLS),
    },
    { onnotice: () => {}, ...(max === undefined ? {} : { max }) },
  );
}

export interface TestDb {
  name: string;
  /** Drizzle as the owner role, on a pool of its own. */
  db: Database;
  /**
   * A raw owner-role client on a single connection, as the migrator needs. Kept apart from
   * `db`, whose construction changes how its client parses dates and JSON
   * (see `createDbFromClient`).
   */
  sql: postgres.Sql;
  /** A further raw client, as the owner unless a login is given. `drop` ends it. */
  connect(options?: TestConnectOptions): postgres.Sql;
  /** Drizzle over a further client, as `connect`. */
  connectDb(options?: TestConnectOptions): Database;
  /** Ends every client this database handed out, then drops it. */
  drop(): Promise<void>;
}

export interface CreateTestDbOptions {
  /**
   * `schema` (the default) is migrated and empty — ask for it unless the test asserts
   * something about the committed seed. `seeded` additionally has the seed loaded and the
   * read models rebuilt. `unmigrated` is a fresh database with no migrations applied.
   */
  template?: TestTemplate | 'unmigrated';
}

/**
 * Give a test file its own database, so files run in parallel without sharing state and a
 * test that writes need not clean up after itself. Connections open on first query, so a
 * test that only needs `name` costs nothing for `db` and `sql`.
 */
export async function createTestDb({
  template = 'schema',
}: CreateTestDbOptions = {}): Promise<TestDb> {
  const run = currentTestRun();
  const name = testDatabaseName(run);
  const admin = createOwnerClient('postgres');
  try {
    if (template === 'unmigrated') {
      // Nothing else connects to the default template, so no need to queue for the lock.
      await admin.unsafe(`CREATE DATABASE "${name}"`);
    } else {
      await withCopyLock(admin, run, () =>
        admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE "${templateName(run, template)}"`),
      );
    }
  } finally {
    await admin.end();
  }

  const clients: postgres.Sql[] = [];
  const connect = (options?: TestConnectOptions) => {
    const client = connectTo(name, options);
    clients.push(client);
    return client;
  };

  return {
    name,
    db: createDbFromClient(connect()),
    sql: connect({ max: 1 }),
    connect,
    connectDb: (options) => createDbFromClient(connect(options)),
    async drop() {
      // Bounded, so a client stuck behind a lock after a failed test cannot hold up the drop,
      // and a client that fails to end cannot leave the database behind: FORCE ends whatever
      // sessions remain.
      await Promise.allSettled(clients.map((client) => client.end({ timeout: 5 })));
      const cleanup = createOwnerClient('postgres');
      try {
        await cleanup.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}

/**
 * Repositories for an app-level unit test. Anything the test does not stub throws when
 * called, so a handler reaching for data the test did not intend to provide fails loudly
 * instead of quietly receiving an empty result. Stubs are per-method: a test that only
 * exercises `topics.list` supplies only that.
 */
export type FakeRepositoryOverrides = {
  [K in keyof Repositories]?: Partial<Repositories[K]>;
};

export function createFakeRepositories(overrides: FakeRepositoryOverrides = {}): Repositories {
  return {
    areas: withThrowingDefaults('areas', overrides.areas),
    indicators: withThrowingDefaults('indicators', overrides.indicators),
    topics: withThrowingDefaults('topics', overrides.topics),
  };
}

/** Shared with `@fphd/internal-api-features/testing`, whose fakes throw the same way. */
export function withThrowingDefaults<T extends object>(name: string, stubs: Partial<T> = {}): T {
  return new Proxy(stubs as T, {
    get(target, property, receiver) {
      // Symbols are left alone so an accidental await or console.log of the object behaves
      // normally rather than resolving a throwing `then`.
      if (typeof property === 'symbol') {
        return Reflect.get(target, property, receiver);
      }

      const stub = Reflect.get(target, property, receiver);
      if (stub !== undefined) {
        return stub;
      }

      return () => {
        throw new Error(
          `The ${name} repository was called (.${property}) but this test did not stub it`,
        );
      };
    },
  });
}

/** Every column of a table as null, as a row with nothing yet filled in. */
export function nullColumns<T extends Table>(table: T): Record<keyof T['$inferSelect'], null> {
  return Object.fromEntries(
    Object.keys(getTableColumns(table)).map((column) => [column, null]),
  ) as Record<keyof T['$inferSelect'], null>;
}

/** An entity's audit entries in the order they were recorded, without their ids and times. */
export async function auditEntriesFor(db: Database, entityId: string) {
  return db
    .select({
      actorId: auditLog.actorId,
      action: auditLog.action,
      entityType: auditLog.entityType,
      requestId: auditLog.requestId,
      changes: auditLog.changes,
    })
    .from(auditLog)
    .where(eq(auditLog.entityId, entityId))
    .orderBy(asc(auditLog.occurredAt), asc(auditLog.id));
}
