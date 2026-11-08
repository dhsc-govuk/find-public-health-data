/**
 * Everything only the operations CLI and the test harness do to a database: bootstrap,
 * migrate, import, seed, reset and rebuild. A package of its own so the API images ship none
 * of it, nor the migrations and data files it reads.
 */

export { READ_MODEL_TABLES } from '@fphd/internal-read-models';
export {
  API_ROLES,
  bootstrapEntraPrincipals,
  bootstrapRoles,
  type DatabaseRole,
  type EntraPrincipal,
} from './bootstrap.ts';
export { assertCoreDataPresent, importCoreData } from './core-data.ts';
export {
  type ApplyDataMigrationResult,
  applyDataMigration,
  type DataMigrationProgress,
  type DataMigrationProgressReporter,
} from './data-migration.ts';
export {
  assertCompleteTableSet,
  assertMigrationFileNames,
  type BaselineManifest,
  baselineManifestSchema,
  DATA_MIGRATION_FORMAT_VERSION,
  DATA_MIGRATION_NULL,
  DATA_MIGRATION_REFERENCE_TABLES,
  DATA_MIGRATION_SCHEMA,
  DATA_MIGRATION_TABLES,
  type DataMigrationManifest,
  dataMigrationManifestSchema,
  type IncrementalManifest,
  incrementalManifestSchema,
} from './data-migration-manifest.ts';
export {
  type DataMigrationRelationships,
  dataMigrationRelationshipsSchema,
  parseDataMigrationRelationships,
} from './data-migration-relationships.ts';
export type { IndicatorTopicFile } from './indicator-topic-file.ts';
export type { IndicatorTopicImportSummary } from './indicator-topic-import.ts';
export {
  type AppliedMigration,
  assertMigratable,
  blockingMigrations,
  compareMigrations,
  type LocalMigration,
  type MigrationReport,
  type MigrationState,
  readAppliedMigrations,
  readLocalMigrations,
} from './migration-status.ts';
export { migrateToLatest } from './migrations.ts';
export { createOwnerGroup } from './owner-group.ts';
export { analyzeReadModels, rebuildReadModels, rebuildReadModelTables } from './read-models.ts';
export { parseReferenceData, referenceDataSchema } from './reference-core-data.ts';
export { resetDatabase } from './reset.ts';
export {
  assertResetAllowed,
  assertSeedingAllowed,
  readCsvHeader,
  SEED_TABLES,
  SEEDED_TABLES,
  type SeedSummary,
  seedDummyTables,
  seedPublishedTables,
} from './seeding.ts';
