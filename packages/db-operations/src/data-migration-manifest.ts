import { z } from '@fphd/config';

import { SEED_TABLES } from './seed-tables.ts';

export const DATA_MIGRATION_FORMAT_VERSION = 4;
export const DATA_MIGRATION_SCHEMA = 'canonical-v4';
export const DATA_MIGRATION_TABLES = SEED_TABLES;
// The importer reads these as complete lists, pointing versions at core data by name and
// staging legacy sources, and stores none of their rows. An incremental therefore carries each in
// full: a changed version can still name a row that did not change.
export const DATA_MIGRATION_REFERENCE_TABLES: readonly string[] = [
  'ci_method',
  'comparator_method',
  'numerator_denominator_source',
];
export const DATA_MIGRATION_NULL = '__FPHD_NULL_5f92c66de4b849b4a717c23f5cbdb8a1__';

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const fileSchema = z.object({
  file: z.string().regex(/^[a-z_]+(?:\.deletes)?\.csv\.gz$/),
  rows: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  sha256: digestSchema,
});
const relationshipsFileSchema = fileSchema.extend({
  file: z.literal('indicator-relationships.json'),
});

const sourceSchema = z.object({
  system: z.literal('fingertips'),
  environment: z.literal('live'),
  database: z.string().min(1),
  snapshot_at: z.iso.datetime({ offset: true }),
  cutoff_at: z.iso.datetime({ offset: true }),
});

const commonSchema = z.object({
  format_version: z.literal(DATA_MIGRATION_FORMAT_VERSION),
  schema: z.literal(DATA_MIGRATION_SCHEMA),
  migration_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
  source: sourceSchema,
  // The source export's sentinel; prepared package CSVs use unquoted empty fields for NULL.
  source_csv_null: z.literal(DATA_MIGRATION_NULL),
  id_mapping: z.literal('deterministic-uuidv7-v1'),
});

export const baselineManifestSchema = commonSchema.extend({
  kind: z.literal('baseline'),
  predecessor: z.null(),
  relationships: relationshipsFileSchema,
  tables: z.record(z.string(), fileSchema),
});

export const incrementalManifestSchema = commonSchema.extend({
  kind: z.literal('incremental'),
  predecessor: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
  relationships: relationshipsFileSchema,
  tables: z.record(
    z.string(),
    z.object({
      upserts: fileSchema,
      deletes: fileSchema,
    }),
  ),
});

export const dataMigrationManifestSchema = z.discriminatedUnion('kind', [
  baselineManifestSchema,
  incrementalManifestSchema,
]);

export type BaselineManifest = z.infer<typeof baselineManifestSchema>;
export type IncrementalManifest = z.infer<typeof incrementalManifestSchema>;
export type DataMigrationManifest = z.infer<typeof dataMigrationManifestSchema>;

export function assertCompleteTableSet(tables: Record<string, unknown>): void {
  const actual = Object.keys(tables).sort().join(',');
  const expected = [...DATA_MIGRATION_TABLES].sort().join(',');
  if (actual !== expected) throw new Error('Data migration table list does not match the schema');
}

export function assertMigrationFileNames(manifest: DataMigrationManifest): void {
  for (const table of DATA_MIGRATION_TABLES) {
    const entry = manifest.tables[table];
    if (!entry) throw new Error(`Data migration has no ${table} entry`);
    if (manifest.kind === 'baseline' && 'file' in entry) {
      if (entry.file !== `${table}.csv.gz`) throw new Error(`Unexpected file for ${table}`);
    } else if (
      manifest.kind === 'incremental' &&
      'upserts' in entry &&
      (entry.upserts.file !== `${table}.csv.gz` || entry.deletes.file !== `${table}.deletes.csv.gz`)
    ) {
      throw new Error(`Unexpected files for ${table}`);
    } else if (
      (manifest.kind === 'baseline' && !('file' in entry)) ||
      (manifest.kind === 'incremental' && !('upserts' in entry))
    ) {
      throw new Error(`Unexpected entry type for ${table}`);
    }
  }
}
