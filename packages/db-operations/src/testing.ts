import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createOwnerClient,
  runTestDatabases,
  staleTestDatabases,
  type TestTemplate,
  templateName,
} from '@fphd/db/testing';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type postgres from 'postgres';

import { importCoreData } from './core-data.ts';
import { asOwnerGroup, migrateToLatest, migrationsFolder } from './migrations.ts';
import { rebuildReadModels } from './read-models.ts';
import { seedDummyTables } from './seeding.ts';

// For the root Vitest global setup, which depends on this package rather than @fphd/db.
export { newTestRun, TEST_RUN_ENV } from '@fphd/db/testing';

async function dropTestDatabases(choose: (names: string[]) => string[]): Promise<void> {
  const admin = createOwnerClient('postgres');
  try {
    const databases = await admin<{ datname: string }[]>`SELECT datname FROM pg_database`;
    for (const name of choose(databases.map(({ datname }) => datname))) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
}

async function buildTemplate(
  run: string,
  stage: TestTemplate,
  source?: TestTemplate,
): Promise<void> {
  const name = templateName(run, stage);
  const admin = createOwnerClient('postgres');
  try {
    const from = source === undefined ? '' : ` TEMPLATE "${templateName(run, source)}"`;
    await admin.unsafe(`CREATE DATABASE "${name}"${from}`);
  } finally {
    await admin.end();
  }

  const template = createOwnerClient(name);
  try {
    if (stage === 'schema') await migrateToLatest(template);
    if (stage === 'core') await importCoreData(template);
    if (stage === 'seeded') {
      await template.begin((tx) => seedDummyTables(tx));
      await rebuildReadModels(template);
    }
  } finally {
    // Left with no connections: a template with an open session cannot be copied.
    await template.end();
  }
}

/**
 * Build the templates the run's test files copy from. Runs once from the root Vitest global
 * setup, where there is no hook timeout and nothing else is competing for the templates.
 * Other runs' databases are left alone unless they are stale.
 */
export async function setUpTestTemplate(run: string): Promise<void> {
  await dropTestDatabases((names) => staleTestDatabases(names));
  await buildTemplate(run, 'schema');
  await buildTemplate(run, 'core', 'schema');
  await buildTemplate(run, 'seeded', 'core');
}

/** Drops the run's templates and any copy a test file failed to drop. */
export async function tearDownTestTemplate(run: string): Promise<void> {
  await dropTestDatabases((names) => runTestDatabases(names, run));
}

/**
 * Applies the migrations up to the one tagged, and that one too when `through` is set. As the
 * owner group, like `migrateToLatest`, so a test can finish the job with either.
 */
async function migrateUpTo(sql: postgres.Sql, tag: string, through: boolean): Promise<void> {
  const folder = mkdtempSync(join(tmpdir(), 'fphd-migrations-'));
  try {
    cpSync(migrationsFolder, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const index = journal.entries.findIndex((entry) => entry.tag === tag);
    if (index === -1) throw new Error(`no migration ${tag}`);
    writeFileSync(
      journalPath,
      JSON.stringify({
        ...journal,
        entries: journal.entries.slice(0, through ? index + 1 : index),
      }),
    );
    await asOwnerGroup(sql, () => migrate(drizzle(sql), { migrationsFolder: folder }));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/**
 * Applies every migration before the one tagged, so a test can put data in the shape that
 * migration meets and then run it with `migrateThrough` or `migrateToLatest`.
 */
export async function migrateBefore(sql: postgres.Sql, tag: string): Promise<void> {
  await migrateUpTo(sql, tag, false);
}

/** Applies the migrations up to and including the one tagged, so later ones leave its test be. */
export async function migrateThrough(sql: postgres.Sql, tag: string): Promise<void> {
  await migrateUpTo(sql, tag, true);
}
