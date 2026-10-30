import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from '@fphd/config';
import { dimensionKey } from '@fphd/db';
import {
  assertCompleteTableSet,
  type BaselineManifest,
  baselineManifestSchema,
  DATA_MIGRATION_FORMAT_VERSION,
  DATA_MIGRATION_NULL,
  DATA_MIGRATION_SCHEMA,
  dataMigrationSourceSchema,
  parseDataMigrationRelationships,
} from '@fphd/db-operations/data-migration-contract';

import { readGzipCsv, transformGzipCsv } from './csv.ts';
import { fileRecord } from './files.ts';
import { normaliseHeader, normaliseRow } from './normalise.ts';
import { writePreparedDirectory } from './prepared-directory.ts';
import { tidyReferenceNames } from './reference-names.ts';
import { foreignKeyIndexes, TABLE_TAGS, TABLES } from './tables.ts';

const sourceFileSchema = z.object({
  file: z.string(),
  rows: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const sourceManifestSchema = z.object({
  source: dataMigrationSourceSchema,
  exported_indicators: z.number().int().positive(),
  indicator_selection: z.object({
    kind: z.literal('approved'),
    indicators: z.array(z.number().int().positive()).min(1),
  }),
  excluded_indicators: z.array(z.number().int()).default([]),
  excluded_non_approved_indicators: z.number().int().nonnegative(),
  excluded_observations: z.number().int().nonnegative().default(0),
  source_csv_null: z.literal(DATA_MIGRATION_NULL),
  tables: z.record(z.string(), sourceFileSchema),
});

type SourceManifest = z.infer<typeof sourceManifestSchema>;

async function verifySourceExport(directory: string, source: SourceManifest): Promise<void> {
  assertCompleteTableSet(source.tables);
  if (source.tables.indicator?.rows !== source.exported_indicators) {
    throw new Error('Source indicator count does not match its manifest');
  }
  for (const table of TABLES) {
    const expected = source.tables[table];
    if (!expected || expected.file !== `${table}.csv.gz`) {
      throw new Error(`Source export has an unexpected file for ${table}`);
    }
    const actual = await fileRecord(join(directory, expected.file), expected.file, expected.rows);
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
      throw new Error(`Source export integrity check failed for ${table}`);
    }
  }
}

export function deterministicUuid(table: string, sourceId: string): string {
  if (!/^[1-9][0-9]*$/.test(sourceId)) {
    throw new Error(`${table} id is not a positive integer: ${sourceId}`);
  }
  const numeric = BigInt(sourceId);
  const encoded = 2n * numeric;
  if (encoded >= 1n << 62n)
    throw new Error(`${table} id is outside the supported range: ${sourceId}`);
  const tag = TABLE_TAGS[table];
  if (tag === undefined) throw new Error(`Unknown table: ${table}`);
  const timestamp = 1_777_593_600_000n;
  const value = (timestamp << 80n) | (0x7n << 76n) | (BigInt(tag) << 64n) | (0x2n << 62n) | encoded;
  const hex = value.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function rekeyDirectory(
  directory: string,
  expectedRows: Record<string, { rows: number }> | undefined,
): Promise<BaselineManifest['tables']> {
  const tables: BaselineManifest['tables'] = {};
  for (const table of TABLES) {
    const path = join(directory, `${table}.csv.gz`);
    let fkIndexes = new Map<number, string>();
    const rows = await transformGzipCsv(
      path,
      (row, header) => {
        const idIndex = header.indexOf('id');
        if (idIndex === -1) throw new Error(`${table} has no id column`);
        const oldId = row[idIndex];
        if (oldId === undefined) throw new Error(`${table} has an empty id`);
        let rekeyed = row.map((value, index) => {
          if (index === idIndex) return deterministicUuid(table, oldId);
          const target = fkIndexes.get(index);
          if (target && value !== '' && value !== DATA_MIGRATION_NULL)
            return deterministicUuid(target, value);
          if (table === 'observation' && header[index] === 'dimension_key')
            return dimensionKey(
              value === ''
                ? []
                : value.split(',').map((id) => deterministicUuid('dimension_value', id)),
            );
          return value;
        });
        // Positions come from the source header, so normalising, which can add columns, runs last.
        rekeyed = normaliseRow(table, header, rekeyed);
        if (table === 'indicator') {
          return [...rekeyed.slice(0, idIndex + 1), oldId, ...rekeyed.slice(idIndex + 1)];
        }
        return rekeyed;
      },
      (header) => {
        fkIndexes = new Map(foreignKeyIndexes(table, header));
        header = normaliseHeader(table, header);
        if (table !== 'indicator') return header;
        const idIndex = header.indexOf('id');
        return [...header.slice(0, idIndex + 1), 'short_id', ...header.slice(idIndex + 1)];
      },
    );
    if (expectedRows && rows !== expectedRows[table]?.rows) {
      throw new Error(`${table} row count changed during rekeying`);
    }
    tables[table] = await fileRecord(path, `${table}.csv.gz`, rows);
    console.log(`${table}: ${rows.toLocaleString()} rows rekeyed`);
  }
  return tables;
}

export async function prepareBaseline(
  directory: string,
  migrationId: string,
  relationshipsPath: string,
  outputDirectory: string,
): Promise<void> {
  const source = sourceManifestSchema.parse(
    JSON.parse(await readFile(join(directory, 'source-manifest.json'), 'utf8')),
  );
  const relationships = parseDataMigrationRelationships(
    JSON.parse(await readFile(relationshipsPath, 'utf8')),
  );
  const withTopics = new Set(relationships.indicatorTopics.map(({ fingertipsId }) => fingertipsId));
  const areaContext = new Set(relationships.areaContextIndicators);
  const withoutTopics = relationships.indicators.filter(
    (id) => !withTopics.has(id) && !areaContext.has(id),
  );
  if (withoutTopics.length > 0) {
    throw new Error(`Reviewed indicators have no topic: ${withoutTopics.join(', ')}`);
  }
  await verifySourceExport(directory, source);
  const indicatorRows = readGzipCsv(join(directory, 'indicator.csv.gz'))[Symbol.asyncIterator]();
  const header = (await indicatorRows.next()).value;
  if (!header) throw new Error('Source indicator file has no header');
  const idIndex = header.indexOf('id');
  const exportedIndicators: number[] = [];
  for (;;) {
    const next = await indicatorRows.next();
    if (next.done) break;
    exportedIndicators.push(Number(next.value[idIndex]));
  }
  const selectedIndicators = source.indicator_selection.indicators
    .filter((id) => !source.excluded_indicators.includes(id))
    .sort((a, b) => a - b);
  if (
    exportedIndicators.length !== selectedIndicators.length ||
    [...exportedIndicators]
      .sort((a, b) => a - b)
      .some((id, index) => id !== selectedIndicators[index])
  )
    throw new Error('Source export does not match the approved indicator selection');
  const declaredIndicators = [...relationships.indicators].sort((left, right) => left - right);
  exportedIndicators.sort((left, right) => left - right);
  if (
    idIndex === -1 ||
    exportedIndicators.length !== declaredIndicators.length ||
    exportedIndicators.some((id, index) => id !== declaredIndicators[index])
  ) {
    throw new Error('Reviewed relationship coverage does not match the exported indicators');
  }

  if (resolve(outputDirectory) === resolve(directory))
    throw new Error('Prepared output must be separate from the source export');
  await writePreparedDirectory(outputDirectory, async (staged) => {
    for (const file of ['source-manifest.json', ...TABLES.map((table) => `${table}.csv.gz`)]) {
      await copyFile(join(directory, file), join(staged, file));
    }
    await tidyReferenceNames(staged);
    const tidiedSource = sourceManifestSchema.parse(
      JSON.parse(await readFile(join(staged, 'source-manifest.json'), 'utf8')),
    );
    const relationshipsFile = 'indicator-relationships.json';
    const relationshipsTarget = join(staged, relationshipsFile);
    await copyFile(relationshipsPath, relationshipsTarget);
    const relationshipRecord = await fileRecord(
      relationshipsTarget,
      relationshipsFile,
      relationships.indicators.length,
    );
    const tables = await rekeyDirectory(staged, tidiedSource.tables);

    const manifest = baselineManifestSchema.parse({
      format_version: DATA_MIGRATION_FORMAT_VERSION,
      schema: DATA_MIGRATION_SCHEMA,
      migration_id: migrationId,
      kind: 'baseline',
      predecessor: null,
      relationships: relationshipRecord,
      source: source.source,
      source_csv_null: DATA_MIGRATION_NULL,
      id_mapping: 'deterministic-uuidv7-v1',
      tables,
    });
    await writeFile(join(staged, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  });
}
