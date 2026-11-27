import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';

import {
  INDICATOR_ID,
  type MigrationFixtureOptions,
  migrationFixture,
  VERSION_COLUMNS,
  VERSION_ID,
  VERSION_ROW,
} from './data-migration.testing.ts';
import { applyDataMigration } from './data-migration.ts';
import type { DataMigrationProgress } from './data-migration-copy.ts';
import {
  DATA_MIGRATION_REFERENCE_TABLES,
  DATA_MIGRATION_TABLES,
} from './data-migration-manifest.ts';

const { SYSTEM_USER_IDS } = schema;

// Packages name their writer as pholio-migration and the tables name users. Any user but the
// PHOLIO migration one stands for a publisher.
export const MIGRATED = SYSTEM_USER_IDS.pholioMigration;
export const PUBLISHER = SYSTEM_USER_IDS.testSeed;

/** The fixture's version row with the given numerator and denominator sources. */
export function version(sources: [string | null, string | null] = [null, null]) {
  return { columns: VERSION_COLUMNS, rows: [[...VERSION_ROW.slice(0, -2), ...sources]] };
}

/** The fixture's version row pointing at an upload batch. */
export function versionWithBatch(batchId: string | null, confirmedAt: string | null) {
  return {
    columns: [...VERSION_COLUMNS, 'upload_batch_id', 'data_table_confirmed_at'],
    rows: [[...VERSION_ROW, batchId, confirmedAt]],
  };
}

/** A processed upload batch for the fixture's version, uploaded by the PHOLIO migration. */
export function batch(id: string) {
  return {
    columns: [
      'id',
      'indicator_id',
      'indicator_version_id',
      'original_filename',
      'uploaded_by',
      'status',
    ],
    rows: [[id, INDICATOR_ID, VERSION_ID, 'migration.csv', 'pholio-migration', 'processed']],
  };
}

/** What the data-migration tests share once the file's copy of the core data exists. */
interface DataMigrationTestState {
  database: TestDb;
  directory: string;
  topicId: string;
  frameworkId: string;
  lifeStageId: string;
}

/**
 * Gives a data-migration test file its own copy of the core data, and a directory to write
 * packages into. The copy is made in a beforeAll, so the hook timeout covers it while it
 * queues behind other files' copies. Before each test it empties every table a package
 * writes, except the reference tables, along with the migration ledger and the audit log,
 * restarts the indicator short id sequence and empties the directory. Call it once, at the
 * top of the file, so its hooks apply to every test there.
 *
 * The database, its client, the directory and the core ids are read through the returned
 * object inside tests and hooks, since they only exist once the beforeAll has run. The
 * functions can be destructured at the top of the file.
 */
/** Milliseconds each part of one test took, printed after the test. */
interface TestTimings {
  startedAt: number;
  truncate: number;
  directory: number;
  fixture: number;
  apply: number;
  tables: number;
  relationships: number;
  applies: number;
}

function emptyTimings(): TestTimings {
  return {
    startedAt: performance.now(),
    truncate: 0,
    directory: 0,
    fixture: 0,
    apply: 0,
    tables: 0,
    relationships: 0,
    applies: 0,
  };
}

/** Postgres's own time for the statements run in this database, when pg_stat_statements is loaded. */
async function statementTotals(sql: TestDb['sql']): Promise<string> {
  try {
    const [totals] = await sql<{ calls: number; ms: number }[]>`
      SELECT coalesce(sum(calls), 0)::int AS calls, round(coalesce(sum(total_exec_time), 0))::int AS ms
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    `;
    const top = await sql<{ calls: number; ms: number; query: string }[]>`
      SELECT calls::int AS calls, round(total_exec_time)::int AS ms, left(regexp_replace(query, '[[:space:]]+', ' ', 'g'), 100) AS query
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      ORDER BY total_exec_time DESC LIMIT 8
    `;
    return [
      `statements calls=${totals?.calls} exec_ms=${totals?.ms}`,
      ...top.map((row) => `  ${row.ms} ms ${row.calls} calls ${row.query}`),
    ].join('\n');
  } catch (error) {
    return `statements unavailable: ${(error as Error).message}`;
  }
}

export function dataMigrationTestDb() {
  let database: TestDb | undefined;
  let state: DataMigrationTestState | undefined;
  let timings = emptyTimings();
  const fileStartedAt = performance.now();

  function ready(): DataMigrationTestState {
    if (!state) throw new Error('The data-migration test database is read before its beforeAll');
    return state;
  }

  beforeAll(async () => {
    database = await createTestDb({ template: 'core' });
    const { sql } = database;
    await sql`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`.catch(() => undefined);
    const [topic] = await sql<{ id: string }[]>`SELECT id FROM topic LIMIT 1`;
    const [framework] = await sql<
      { id: string }[]
    >`SELECT id FROM classification WHERE dimension = 'framework' LIMIT 1`;
    const [lifeStage] = await sql<
      { id: string }[]
    >`SELECT id FROM classification WHERE dimension = 'life_stage' LIMIT 1`;
    if (!topic || !framework || !lifeStage) throw new Error('Missing core fixture data');
    state = {
      database,
      directory: await mkdtemp(join(tmpdir(), 'fphd-data-migration-test-')),
      topicId: topic.id,
      frameworkId: framework.id,
      lifeStageId: lifeStage.id,
    };
  });

  const tables = DATA_MIGRATION_TABLES.filter(
    (table) => !DATA_MIGRATION_REFERENCE_TABLES.includes(table),
  );
  beforeEach(async () => {
    timings = emptyTimings();
    const { database, directory } = ready();
    const truncateStartedAt = performance.now();
    await database.sql.unsafe(
      `TRUNCATE ${tables.map((table) => `"${table}"`).join(', ')}, data_migration, audit_log CASCADE`,
    );
    await database.sql`ALTER SEQUENCE indicator_short_id_seq RESTART WITH 100000`;
    const directoryStartedAt = performance.now();
    timings.truncate = directoryStartedAt - truncateStartedAt;
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory);
    timings.directory = performance.now() - directoryStartedAt;
  });
  afterEach(() => {
    const total = performance.now() - timings.startedAt;
    const round = (ms: number) => Math.round(ms);
    console.log(
      `[timing] test total_ms=${round(total)} truncate_ms=${round(timings.truncate)} directory_ms=${round(timings.directory)} fixture_ms=${round(timings.fixture)} apply_ms=${round(timings.apply)} apply_tables_ms=${round(timings.tables)} apply_relationships_ms=${round(timings.relationships)} applies=${timings.applies} other_ms=${round(total - timings.truncate - timings.directory - timings.fixture - timings.apply)}`,
    );
  });
  afterAll(async () => {
    if (database)
      console.log(
        `[timing] file wall_ms=${Math.round(performance.now() - fileStartedAt)}\n${await statementTotals(database.sql)}`,
      );
    if (state) await rm(state.directory, { recursive: true, force: true });
    await database?.drop();
  });

  async function apply(options: MigrationFixtureOptions = {}) {
    const { database, directory, topicId } = ready();
    const fixtureStartedAt = performance.now();
    const { manifest, sha256 } = await migrationFixture(database.sql, directory, topicId, options);
    const applyStartedAt = performance.now();
    timings.fixture += applyStartedAt - fixtureStartedAt;
    const started = new Map<string, number>();
    const report = ({ table, phase, state }: DataMigrationProgress) => {
      const key = `${phase}:${table}`;
      if (state === 'started') started.set(key, performance.now());
      if (state === 'complete') {
        const elapsed = performance.now() - (started.get(key) ?? performance.now());
        if (phase === 'relationships') timings.relationships += elapsed;
        else timings.tables += elapsed;
      }
    };
    try {
      return await database.sql.begin((tx) =>
        applyDataMigration(tx, directory, manifest, sha256, report),
      );
    } finally {
      timings.apply += performance.now() - applyStartedAt;
      timings.applies += 1;
    }
  }

  return {
    get database() {
      return ready().database;
    },
    get sql() {
      return ready().database.sql;
    },
    get directory() {
      return ready().directory;
    },
    get topicId() {
      return ready().topicId;
    },
    get frameworkId() {
      return ready().frameworkId;
    },
    get lifeStageId() {
      return ready().lifeStageId;
    },
    apply,
    baseline: (options: MigrationFixtureOptions = {}) => apply({ baseline: true, ...options }),
    /** How many sources the fixture's version names. */
    async sourceCount() {
      const [row] = await ready().database.sql<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM indicator_version_source WHERE indicator_version_id = ${VERSION_ID}`;
      return row?.count;
    },
    /** Checks the database still holds the baseline alone, as a refused package leaves it. */
    async assertRolledBack() {
      const [row] = await ready().database.sql<
        { name: string; migrations: number; topics: number }[]
      >`
        SELECT v.name, (SELECT count(*)::int FROM data_migration) AS migrations,
          (SELECT count(*)::int FROM indicator_version_topic WHERE indicator_version_id = v.id) AS topics
        FROM indicator_version v WHERE id = ${VERSION_ID}
      `;
      expect(row).toEqual({ name: 'Test indicator', migrations: 1, topics: 1 });
    },
  };
}
