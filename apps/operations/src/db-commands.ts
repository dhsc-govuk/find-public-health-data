import { createPostgresClient } from '@fphd/db';
import {
  API_ROLES,
  analyzeReadModels,
  applyDataMigration,
  assertCoreDataPresent,
  assertMigratable,
  assertResetAllowed,
  assertSeedingAllowed,
  bootstrapEntraPrincipals,
  bootstrapRoles,
  compareMigrations,
  createOwnerGroup,
  type DatabaseRole,
  type EntraPrincipal,
  importCoreData as importCoreDataFromFiles,
  READ_MODEL_TABLES,
  readAppliedMigrations,
  readLocalMigrations,
  rebuildReadModels as rebuildReadModelsFromCanonical,
  rebuildReadModelTables,
  resetDatabase,
  SEED_TABLES,
  SEEDED_TABLES,
  seedDummyTables,
  seedPublishedTables,
} from '@fphd/db-operations';

import type { CommandContext } from './commands.ts';
import { downloadDataMigration } from './data-migration-package.ts';
import type { Config } from './load-config.ts';
import { downloadPublishedSnapshot } from './published-snapshot.ts';

const IMPORTED_TABLES = [
  ...SEEDED_TABLES,
  'indicator_version_topic',
  'indicator_version_subtopic',
  'indicator_version_classification',
] as const;

/**
 * The role names are fixed — the APIs connect as `public_api` and `internal_api`, and only
 * the passwords are injected — so this maps the two optional config values onto them. It
 * refuses rather than bootstrapping half the pair and reporting success.
 */
export function rolesToBootstrap(roles: Config['roles']): DatabaseRole[] {
  const required = [
    {
      name: API_ROLES.publicApi,
      variable: 'PUBLIC_API_PASSWORD',
      password: roles.publicApiPassword,
    },
    {
      name: API_ROLES.internalApi,
      variable: 'INTERNAL_API_PASSWORD',
      password: roles.internalApiPassword,
    },
  ];

  const missing = required.filter((role) => role.password === undefined);
  if (missing.length > 0) {
    throw new Error(
      `db bootstrap needs ${missing.map((role) => role.variable).join(' and ')} in the environment`,
    );
  }

  return required.flatMap(({ name, password }) =>
    password === undefined ? [] : [{ name, password }],
  );
}

/** Under DB_AUTH=entra, the two API identities' principals, refusing half the pair as above. */
export function principalsToBootstrap(roles: Config['roles']): EntraPrincipal[] {
  const required = [
    { group: API_ROLES.publicApi, prefix: 'PUBLIC_API', principal: roles.publicApiPrincipal },
    {
      group: API_ROLES.internalApi,
      prefix: 'INTERNAL_API',
      principal: roles.internalApiPrincipal,
    },
  ];

  const missing = required.filter((role) => role.principal === undefined);
  if (missing.length > 0) {
    const variables = missing.flatMap(({ prefix }) => [`${prefix}_DB_USER`, `${prefix}_OBJECT_ID`]);
    throw new Error(`db bootstrap needs ${variables.join(', ')} in the environment`);
  }

  return required.flatMap(({ group, principal }) =>
    principal === undefined ? [] : [{ group, ...principal }],
  );
}

/**
 * Also creates the owner group, which a restored dump names as owner but doesn't carry. Under
 * Entra the principals are created over a connection to the `postgres` database, where Azure
 * provides the pgaadauth functions. Roles belong to the whole server, so that is no
 * different from creating them in the app's database.
 */
export async function bootstrap({ sql, config }: CommandContext): Promise<void> {
  if ('entraClientId' in config.db) {
    const principals = principalsToBootstrap(config.roles);
    const server = createPostgresClient(
      { ...config.db, database: 'postgres' },
      { max: 1, onnotice: () => {} },
    );
    try {
      await bootstrapEntraPrincipals(server, principals);
    } finally {
      await server.end();
    }
  } else {
    await bootstrapRoles(sql, rolesToBootstrap(config.roles));
  }
  await sql.begin((tx) => createOwnerGroup(tx));
}

/**
 * Loads the required starting data — the content every environment needs before it can
 * serve anything, as opposed to the dummy seed. Idempotent and ungated: preview and
 * production run this too.
 */
export async function importCoreData({ sql, logger }: CommandContext): Promise<void> {
  const {
    topics,
    subtopics,
    ciMethods,
    classifications,
    dataProviders,
    valueTypes,
    units,
    comparatorMethods,
  } = await importCoreDataFromFiles(sql);
  logger.info({ ...topics.summary }, 'Topics imported');
  logger.info({ ...subtopics.summary }, 'Subtopics imported');
  for (const row of subtopics.orphaned)
    logger.warn(
      { id: row.id, topicId: row.topicId, slug: row.slug },
      'Subtopic in the database but absent from the file; left in place',
    );
  for (const topic of topics.orphaned) {
    logger.warn(
      { id: topic.id, slug: topic.slug },
      'Topic in the database but absent from the file; left in place',
    );
  }
  logger.info({ ...ciMethods.summary }, 'CI methods imported');
  for (const method of ciMethods.orphaned) {
    logger.warn(
      { id: method.id, methodName: method.name },
      'CI method in the database but absent from the file; left in place',
    );
  }
  logger.info({ ...classifications.summary }, 'Classifications imported');
  for (const row of classifications.orphaned) {
    logger.warn(
      { id: row.id, slug: row.slug },
      'Classification in the database but absent from the file; left in place',
    );
  }
  logger.info(
    { providers: dataProviders.providers, sources: dataProviders.sources },
    'Data providers imported',
  );
  for (const row of dataProviders.orphaned) {
    logger.warn(
      { id: row.id, providerOrSourceName: row.name },
      'Data provider or source in the database but absent from the file; left in place',
    );
  }
  const lists = [
    ['Value types', 'Value type', valueTypes],
    ['Units', 'Unit', units],
    ['Comparator methods', 'Comparator method', comparatorMethods],
  ] as const;
  for (const [plural, singular, { summary, orphaned }] of lists) {
    logger.info({ ...summary }, `${plural} imported`);
    for (const row of orphaned) {
      logger.warn(
        { id: row.id, entryName: row.name },
        `${singular} in the database but absent from the file; left in place`,
      );
    }
  }
}

/**
 * Seeds, imports the dummy indicator relationships and rebuilds the read models in one
 * command and one transaction: a job runs one command, a seeded database whose read models
 * are still empty serves an empty site, and one commit means readers never see a partial
 * state mid-run and any failure rolls the whole seed back.
 *
 * Core data must already be imported — the relationships reference topics by id, and dummy
 * data may depend on core data, never the reverse.
 */
export async function seedDummyData({ sql, config, logger }: CommandContext): Promise<void> {
  assertSeedingAllowed(config.appEnv);
  await assertCoreDataPresent(sql);

  const { tables, relationships } = await sql.begin(async (tx) => {
    const seeded = await seedDummyTables(tx);
    await rebuildReadModelTables(tx);
    return seeded;
  });
  await analyzeReadModels(sql);

  for (const [table, rows] of Object.entries(tables)) {
    logger.info({ table, rows }, 'Dummy table seeded');
  }
  const { unknownTopics, unknownClassifications, unknownIndicators, ...counts } = relationships;
  logger.info(counts, 'Indicator relationships imported');
  if (unknownTopics.length > 0) {
    logger.warn({ topics: unknownTopics }, 'Topic ids in the file not in this database; skipped');
  }
  if (unknownClassifications.length > 0) {
    logger.warn(
      { classifications: unknownClassifications },
      'Classification ids in the file not in this database; skipped',
    );
  }
  if (unknownIndicators.length > 0) {
    logger.warn(
      { indicators: unknownIndicators },
      'Indicators in the file not in this database; skipped',
    );
  }
}

/** Replaces dev seed data with the approved-only published benchmark snapshot. */
export async function importPublishedSnapshot({
  sql,
  config,
  logger,
}: CommandContext): Promise<void> {
  assertSeedingAllowed(config.appEnv, 'import published snapshot');
  await assertCoreDataPresent(sql);
  const { url, sha256 } = config.publishedSnapshot;
  if (!url || !sha256) {
    throw new Error(
      'db import-published-snapshot needs PUBLISHED_SNAPSHOT_URL and PUBLISHED_SNAPSHOT_SHA256',
    );
  }

  const snapshot = await downloadPublishedSnapshot(url, sha256, ({ bytes, error }) =>
    logger.warn({ bytes, err: error }, 'Published snapshot download retrying'),
  );
  try {
    const seeded = await sql.begin(async (tx) => {
      const result = await seedPublishedTables(tx, snapshot.directory);
      for (const table of SEED_TABLES) {
        if (result.tables[table] !== snapshot.manifest.tables[table]?.rows) {
          throw new Error(`Published snapshot row count failed for ${table}`);
        }
      }
      // Recheck the version status after COPY. The exporter only reads approved
      // indicators, but this makes the import itself fail closed if an archive is
      // ever mislabeled or replaced before the transaction commits.
      const [drafts] = await tx.unsafe(
        "SELECT count(*)::int AS count FROM indicator_version WHERE status IS DISTINCT FROM 'published'",
      );
      if (Number(drafts?.count) !== 0) {
        throw new Error('Published snapshot contains an unpublished indicator version');
      }
      // Matching row counts do not prove the versions are spread one per indicator.
      const [uneven] = await tx.unsafe(
        `SELECT count(*)::int AS count FROM indicator i
         WHERE (SELECT count(*) FROM indicator_version v
                WHERE v.indicator_id = i.id AND v.status = 'published') <> 1`,
      );
      if (Number(uneven?.count) !== 0) {
        throw new Error('Published snapshot does not hold one published version per indicator');
      }
      // The dummy seed's planner statistics would give the full-data
      // read-model rebuild a misleading plan. Analyze before those large queries.
      for (const table of IMPORTED_TABLES) await tx.unsafe(`ANALYZE "${table}"`);
      await rebuildReadModelTables(tx);
      return result;
    });
    await analyzeReadModels(sql);
    logger.info(
      { tables: seeded.tables, topicLinks: seeded.relationships.links },
      'Published snapshot imported',
    );
  } finally {
    await snapshot.cleanup();
  }
}

/** Applies an ordered, approved-live baseline or incremental package without replacing data. */
export async function migrateLiveData({ sql, config, logger }: CommandContext): Promise<void> {
  await assertCoreDataPresent(sql);
  const { url, sha256 } = config.dataMigration;
  if (!url || !sha256) {
    throw new Error('db migrate-live-data needs DATA_MIGRATION_URL and DATA_MIGRATION_SHA256');
  }
  logger.info('Downloading live data migration package');
  const migration = await downloadDataMigration(url, sha256, ({ bytes, error }) =>
    logger.warn({ bytes, err: error }, 'Live data migration download retrying'),
  );
  logger.info(
    { migration: migration.manifest.migration_id, kind: migration.manifest.kind },
    'Live data migration package downloaded and verified',
  );
  try {
    const result = await sql.begin(async (tx) => {
      const applied = await applyDataMigration(
        tx,
        migration.directory,
        migration.manifest,
        sha256,
        (progress) => logger.info(progress, 'Live data migration progress'),
      );
      if (!applied.applied) return applied;
      for (const table of IMPORTED_TABLES) await tx.unsafe(`ANALYZE "${table}"`);
      await rebuildReadModelTables(tx);
      return applied;
    });
    if (result.applied) await analyzeReadModels(sql);
    logger.info(
      {
        migration: migration.manifest.migration_id,
        kind: migration.manifest.kind,
        applied: result.applied,
        changes: result.changes,
      },
      result.applied ? 'Live data migration applied' : 'Live data migration already applied',
    );
  } finally {
    await migration.cleanup();
  }
}

/** Reports each table's row count after the rebuild — an empty read model serves an empty site. */
export async function rebuildReadModels({ sql, logger }: CommandContext): Promise<void> {
  await rebuildReadModelsFromCanonical(sql);
  for (const table of READ_MODEL_TABLES) {
    const [row] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM ${sql(table)}
    `;
    logger.info({ table, rows: row?.count ?? 0 }, 'Read model rebuilt');
  }
}

/**
 * The gate is the only guard: a deployed job has no interactive confirmation, so refusing
 * outside dev-class environments is what stands between this and a production database.
 */
export async function reset({ sql, config }: CommandContext): Promise<void> {
  assertResetAllowed(config.appEnv);
  await resetDatabase(sql);
}

/**
 * One structured line per migration rather than a table, because a job's stdout is the log
 * stream and a deployed environment reads it as JSON. It reports first and fails after, so
 * the detail is on the way out before the error that gates a pipeline on it.
 */
export async function status({ sql, logger }: CommandContext): Promise<void> {
  const reports = compareMigrations(readLocalMigrations(), await readAppliedMigrations(sql));

  for (const report of reports) {
    logger.info({ migration: report.tag, state: report.state }, 'Migration');
  }

  const counts = reports.reduce<Record<string, number>>((totals, report) => {
    totals[report.state] = (totals[report.state] ?? 0) + 1;
    return totals;
  }, {});
  logger.info({ total: reports.length, ...counts }, 'Migration status');

  assertMigratable(reports);
}
