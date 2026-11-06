import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import type postgres from 'postgres';

import {
  DATA_MIGRATION_FORMAT_VERSION,
  DATA_MIGRATION_NULL,
  DATA_MIGRATION_SCHEMA,
  DATA_MIGRATION_TABLES,
  dataMigrationManifestSchema,
} from './data-migration-manifest.ts';
import type { DataMigrationRelationships } from './data-migration-relationships.ts';

export const INDICATOR_ID = 'ffffffff-ffff-7fff-ffff-ffffffffffff';
export const VERSION_ID = '11111111-1111-7111-1111-111111111111';
export const SOURCE_ID = 'bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb';
export const VERSION_COLUMNS = [
  'id',
  'indicator_id',
  'status',
  'published_at',
  'name',
  'slug',
  'created_by',
  'updated_by',
  'ci_method_id',
  'comparator_method_id',
  'numerator_source_id',
  'denominator_source_id',
];
export const VERSION_ROW = [
  VERSION_ID,
  INDICATOR_ID,
  'published',
  '2026-01-01T00:00:00Z',
  'Test indicator',
  'test-indicator',
  'pholio-migration',
  'pholio-migration',
  null,
  null,
  null,
  null,
];

type Cell = string | number | null;
export interface CsvFixture {
  columns: string[];
  rows?: Cell[][];
}
export interface MigrationFixtureOptions {
  baseline?: boolean;
  migrationId?: string;
  predecessor?: string;
  cutoffAt?: string;
  upserts?: Record<string, CsvFixture>;
  deletes?: Record<string, string[]>;
  deleteHeaders?: Record<string, string[]>;
  deleteRows?: Record<string, number>;
  relationships?: Partial<DataMigrationRelationships>;
}

export async function migrationFixture(
  sql: postgres.Sql,
  directory: string,
  topicId: string,
  options: MigrationFixtureOptions = {},
) {
  const relationships = {
    approval: {
      approvedBy: 'migration test',
      approvedAt: '2026-09-22T10:00:00Z',
      basis: 'integration fixture',
    },
    indicators: [108],
    indicatorTopics: [{ topicId, fingertipsId: 108 }],
    indicatorDataUpdatedAt: {},
    classifications: [],
    indicatorClassifications: [],
    ...options.relationships,
  };
  const json = Buffer.from(JSON.stringify(relationships));
  const relationshipFile = 'indicator-relationships.json';
  await writeFile(join(directory, relationshipFile), json);

  const defaults: Record<string, CsvFixture> = {
    ci_method: { columns: ['id', 'name', 'description'] },
    comparator_method: { columns: ['id', 'name'] },
    numerator_denominator_source: { columns: ['id', 'name', 'url'] },
    area_type: {
      columns: ['id', 'name', 'hierarchy_type', 'level'],
      rows: [['44444444-4444-7444-8444-444444444444', 'England', 'Administrative', 1]],
    },
    area: {
      columns: ['id', 'area_type_id', 'code', 'name', 'is_current'],
      rows: [
        [
          '44444444-4444-7444-8444-444444444444',
          '44444444-4444-7444-8444-444444444444',
          'E92000001',
          'England',
          't',
        ],
      ],
    },
    indicator_version: { columns: VERSION_COLUMNS, rows: options.baseline ? [VERSION_ROW] : [] },
    indicator: { columns: ['short_id', 'id'], rows: options.baseline ? [[108, INDICATOR_ID]] : [] },
  };
  const tables: Record<string, unknown> = {};
  for (const table of DATA_MIGRATION_TABLES) {
    const fixture = options.upserts?.[table] ??
      defaults[table] ?? {
        columns: (
          await sql<{ column: string }[]>`
        SELECT attname AS column FROM pg_attribute
        WHERE attrelid = ${table}::regclass AND attnum > 0 AND NOT attisdropped
        ORDER BY attnum DESC
      `
        ).map(({ column }) => column),
      };
    const rows = fixture.rows ?? [];
    const csv = `${[
      fixture.columns.join(','),
      ...rows.map((row) =>
        row
          .map((value) => (value === null ? '' : `"${String(value).replaceAll('"', '""')}"`))
          .join(','),
      ),
    ].join('\n')}\n`;
    const file = `${table}.csv.gz`;
    const bytes = gzipSync(csv);
    await writeFile(join(directory, file), bytes);
    const upserts = { file, rows: rows.length, bytes: bytes.length, sha256: digest(bytes) };
    if (options.baseline) {
      tables[table] = upserts;
    } else {
      const ids = options.deletes?.[table] ?? [];
      const deleteFile = `${table}.deletes.csv.gz`;
      const header = (options.deleteHeaders?.[table] ?? ['id']).join(',');
      const deleted = gzipSync(`${[header, ...ids].join('\n')}\n`);
      await writeFile(join(directory, deleteFile), deleted);
      tables[table] = {
        upserts,
        deletes: {
          file: deleteFile,
          rows: options.deleteRows?.[table] ?? ids.length,
          bytes: deleted.length,
          sha256: digest(deleted),
        },
      };
    }
  }
  const cutoffAt =
    options.cutoffAt ?? (options.baseline ? '2026-09-21T10:00:00Z' : '2026-09-22T10:00:00Z');
  const manifest = dataMigrationManifestSchema.parse({
    format_version: DATA_MIGRATION_FORMAT_VERSION,
    schema: DATA_MIGRATION_SCHEMA,
    migration_id: options.migrationId ?? (options.baseline ? 'baseline-1' : 'increment-2'),
    kind: options.baseline ? 'baseline' : 'incremental',
    predecessor: options.baseline ? null : (options.predecessor ?? 'baseline-1'),
    source: {
      system: 'fingertips',
      environment: 'live',
      database: 'source',
      snapshot_at: cutoffAt,
      cutoff_at: cutoffAt,
    },
    source_csv_null: DATA_MIGRATION_NULL,
    id_mapping: 'deterministic-uuidv7-v1',
    relationships: {
      file: relationshipFile,
      rows: relationships.indicators.length,
      bytes: json.length,
      sha256: digest(json),
    },
    tables,
  });
  return { manifest, sha256: digest(Buffer.from(JSON.stringify(manifest))) };
}

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
