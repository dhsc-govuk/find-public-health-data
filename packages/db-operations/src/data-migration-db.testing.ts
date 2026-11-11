import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { schema } from '@fphd/db';
import { createTestDb } from '@fphd/db/testing';
import { afterAll, beforeEach, expect } from 'vitest';

import {
  INDICATOR_ID,
  type MigrationFixtureOptions,
  migrationFixture,
  VERSION_COLUMNS,
  VERSION_ID,
  VERSION_ROW,
} from './data-migration.testing.ts';
import { applyDataMigration } from './data-migration.ts';
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

/**
 * Gives a data-migration test file its own copy of the core data, and a directory to write
 * packages into. Before each test it empties every table a package writes, except the
 * reference tables, along with the migration ledger and the audit log, restarts the
 * indicator short id sequence and empties the directory. Call it once, at the top of the
 * file, so its hooks apply to every test there.
 */
export async function dataMigrationTestDb() {
  const database = await createTestDb({ template: 'core' });
  const { sql } = database;
  const [topic] = await sql<{ id: string }[]>`SELECT id FROM topic LIMIT 1`;
  const [framework] = await sql<
    { id: string }[]
  >`SELECT id FROM classification WHERE dimension = 'framework' LIMIT 1`;
  const [lifeStage] = await sql<
    { id: string }[]
  >`SELECT id FROM classification WHERE dimension = 'life_stage' LIMIT 1`;
  if (!topic || !framework || !lifeStage) throw new Error('Missing core fixture data');
  const topicId = topic.id;
  const directory = await mkdtemp(join(tmpdir(), 'fphd-data-migration-test-'));

  const tables = DATA_MIGRATION_TABLES.filter(
    (table) => !DATA_MIGRATION_REFERENCE_TABLES.includes(table),
  );
  beforeEach(async () => {
    await sql.unsafe(
      `TRUNCATE ${tables.map((table) => `"${table}"`).join(', ')}, data_migration, audit_log CASCADE`,
    );
    await sql`ALTER SEQUENCE indicator_short_id_seq RESTART WITH 100000`;
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory);
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
    await database.drop();
  });

  async function apply(options: MigrationFixtureOptions = {}) {
    const { manifest, sha256 } = await migrationFixture(sql, directory, topicId, options);
    return sql.begin((tx) => applyDataMigration(tx, directory, manifest, sha256));
  }

  return {
    database,
    sql,
    directory,
    topicId,
    frameworkId: framework.id,
    lifeStageId: lifeStage.id,
    apply,
    baseline: (options: MigrationFixtureOptions = {}) => apply({ baseline: true, ...options }),
    /** How many sources the fixture's version names. */
    async sourceCount() {
      const [row] = await sql<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM indicator_version_source WHERE indicator_version_id = ${VERSION_ID}`;
      return row?.count;
    },
    /** Checks the database still holds the baseline alone, as a refused package leaves it. */
    async assertRolledBack() {
      const [row] = await sql<{ name: string; migrations: number; topics: number }[]>`
        SELECT v.name, (SELECT count(*)::int FROM data_migration) AS migrations,
          (SELECT count(*)::int FROM indicator_version_topic WHERE indicator_version_id = v.id) AS topics
        FROM indicator_version v WHERE id = ${VERSION_ID}
      `;
      expect(row).toEqual({ name: 'Test indicator', migrations: 1, topics: 1 });
    },
  };
}
