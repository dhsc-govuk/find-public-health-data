import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseReferenceData, referenceDataSchema } from '@fphd/db-operations';
import { DATA_MIGRATION_NULL } from '@fphd/db-operations/data-migration-contract';

import { readGzipCsv } from '../csv.ts';
import { rekeyTable } from '../prepare-baseline.ts';
import { writePreparedDirectory } from '../prepared-directory.ts';
import { tidyReferenceTables } from '../reference-names.ts';
import { readCodeHistory } from './code-history.ts';
import { exportDimensions } from './dimensions.ts';
import { exportGeography } from './geography.ts';
import { exportNoteTypes } from './lookups.ts';
import { publicDimensions } from './public-dimensions.ts';
import { connectToPholio, queryPholio } from './source.ts';

const lookupTables = {
  areaTypes: 'area_type',
  dimensionTypes: 'dimension_type',
  dimensionValues: 'dimension_value',
  noteTypes: 'note_type',
} as const;
// The public API's names for dimensions, derived from the lookups above.
const publicNameFiles = {
  dimensionTypesPublic: 'dimension-types-public.json',
  dimensionValuesPublic: 'dimension-values-public.json',
  deprivationSchemes: 'deprivation-schemes.json',
} as const;
const integerColumns = new Set(['level', 'display_order', 'sort_order']);
const booleanColumns = new Set(['is_required', 'is_aggregate']);

interface CoreReferenceOptions {
  connectionString: string;
  expectedDatabase: string;
  backupSha256: string;
  /** The ONS Code History Database's `ChangeHistory.csv`, for each area's validity. */
  codeHistoryCsv: string;
  outDir: string;
}

async function lookupRecords(path: string) {
  const records: Record<string, string | number | boolean | null>[] = [];
  let header: string[] | undefined;
  for await (const row of readGzipCsv(path)) {
    if (header === undefined) {
      header = row;
      continue;
    }
    records.push(
      Object.fromEntries(
        header.map((column, index) => {
          const key = column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
          const value = row[index];
          if (value === DATA_MIGRATION_NULL) return [key, null];
          if (integerColumns.has(column) && value && /^-?\d+$/.test(value))
            return [key, Number(value)];
          if (booleanColumns.has(column) && (value === 't' || value === 'f'))
            return [key, value === 't'];
          return [key, value];
        }),
      ),
    );
  }
  return records;
}

export async function exportCoreReferenceData(options: CoreReferenceOptions): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(options.backupSha256))
    throw new Error('Expected a lowercase SHA-256 digest for --backup-sha256');

  const codeHistory = await readCodeHistory(options.codeHistoryCsv);

  await writePreparedDirectory(options.outDir, async (staged) => {
    const raw = join(staged, 'source');
    await mkdir(raw);
    const pool = await connectToPholio(options.connectionString);
    const source = { name: options.expectedDatabase, access: 'READ_ONLY' };
    const rowCounts = new Map<string, number>();
    const ageYears = new Map<string, { min: number; max: number }>();
    try {
      const [identity] = await queryPholio<{ name: string; access: string }>(
        pool,
        "SELECT DB_NAME() AS name, DATABASEPROPERTYEX(DB_NAME(), 'Updateability') AS access",
      );
      if (identity?.name !== source.name || identity.access !== source.access)
        throw new Error(
          `Connected to ${identity?.name} (${identity?.access}); expected ${source.name} (READ_ONLY)`,
        );

      const context = { pool, outDir: raw };
      const geography = await exportGeography(context, codeHistory.validity);
      const dimensions = await exportDimensions(context);
      const notes = await exportNoteTypes(context);
      const ages = await queryPholio<{ AgeID: number; MinYears: number; MaxYears: number }>(
        pool,
        'SELECT AgeID, MinYears, MaxYears FROM L_Ages WHERE MinYears IS NOT NULL AND MaxYears IS NOT NULL',
      );
      for (const age of ages) {
        ageYears.set(String(age.AgeID), { min: age.MinYears, max: age.MaxYears });
      }
      for (const [table, file] of Object.entries({
        ...geography.tables,
        ...dimensions.tables,
        note_type: notes.file,
      })) {
        rowCounts.set(table, file.rows);
      }
    } finally {
      await pool.close();
    }

    const { tables: tidied } = await tidyReferenceTables(raw);
    const lookupRows: Record<string, Awaited<ReturnType<typeof lookupRecords>>> = {};
    for (const [key, table] of Object.entries(lookupTables)) {
      const path = join(raw, `${table}.csv.gz`);
      const file = await rekeyTable(path, table, tidied[table]?.rows ?? rowCounts.get(table));
      const rows = await lookupRecords(path);
      if (rows.length !== file.rows) throw new Error(`Missing lookup rows for ${table}`);
      lookupRows[key] = rows;
    }
    const names = publicDimensions(
      referenceDataSchema.shape.dimensionTypes.parse(lookupRows.dimensionTypes),
      referenceDataSchema.shape.dimensionValues.parse(lookupRows.dimensionValues),
      ageYears,
    );
    const lookups = parseReferenceData({
      ...lookupRows,
      dimensionTypesPublic: names.types,
      dimensionValuesPublic: names.values,
      deprivationSchemes: names.deprivationSchemes,
    });
    for (const key of Object.keys(lookupTables) as (keyof typeof lookupTables)[]) {
      const file = `${lookupTables[key].replace('_', '-')}s.json`;
      await writeFile(join(staged, file), `${JSON.stringify(lookups[key], null, 2)}\n`);
    }
    for (const [key, file] of Object.entries(publicNameFiles) as [
      keyof typeof publicNameFiles,
      string,
    ][]) {
      await writeFile(join(staged, file), `${JSON.stringify(lookups[key], null, 2)}\n`);
    }

    const geographyDir = join(staged, 'geography');
    await mkdir(geographyDir);
    const files: Record<string, Awaited<ReturnType<typeof rekeyTable>>> = {};
    for (const table of ['area', 'area_relationship']) {
      const path = join(raw, `${table}.csv.gz`);
      const file = await rekeyTable(path, table, rowCounts.get(table));
      await rename(path, join(geographyDir, file.file));
      files[table] = file;
    }
    const manifest = {
      source: { ...source, backupSha256: options.backupSha256 },
      codeHistory: { sha256: codeHistory.sha256 },
      files,
    };
    await writeFile(join(geographyDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await rm(raw, { recursive: true });
  });
}
