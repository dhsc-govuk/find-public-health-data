import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DATA_MIGRATION_NULL } from '@fphd/db-operations/data-migration-contract';
import { ensureDirectory } from '../files.ts';
import { checkSlugs } from '../indicator-checks.ts';
import { TABLES } from '../tables.ts';
import type { IndicatorSelection, StageResult } from './context.ts';
import { exportDimensions } from './dimensions.ts';
import { exportGeography } from './geography.ts';
import { exportIndicators } from './indicators.ts';
import { exportLookups } from './lookups.ts';
import { exportObservations } from './observations.ts';
import { connectToPholio, queryPholio } from './source.ts';

export interface ExportPholioOptions {
  connectionString: string;
  outDir: string;
  /** The Pholio database the connection must reach, checked before anything is read. */
  expectedDatabase: string;
  excludedIndicators?: readonly number[];
  /** See ObservationExportOptions.supersededSentinelIndicators. */
  supersededSentinelIndicators?: readonly number[];
  indicatorSelection: IndicatorSelection;
}

/**
 * Reads Pholio directly and writes the source export prepare-baseline and the dev snapshot take:
 * the same tables and columns export-live wrote from the alpha intermediate database.
 */
export async function exportPholio(options: ExportPholioOptions): Promise<void> {
  if (
    options.indicatorSelection.kind === 'approved' &&
    options.indicatorSelection.indicators.length === 0
  ) {
    throw new Error('The approved indicator list is empty');
  }
  await ensureDirectory(options.outDir);
  const pool = await connectToPholio(options.connectionString);
  try {
    const [identity] = await queryPholio<{ database: string; snapshotAt: Date }>(
      pool,
      'SELECT DB_NAME() AS [database], SYSUTCDATETIME() AS snapshotAt',
    );
    if (identity?.database !== options.expectedDatabase) {
      throw new Error(
        `Connected to ${String(identity?.database)}; expected ${options.expectedDatabase}`,
      );
    }
    const snapshotAt = new Date(identity.snapshotAt).toISOString();
    const context = {
      pool,
      outDir: options.outDir,
      excludedIndicators: options.excludedIndicators ?? [],
      indicatorSelection: options.indicatorSelection,
    };
    const lookups = await exportLookups(context);
    const geography = await exportGeography(context);
    const dimensions = await exportDimensions(context);
    const indicators = await exportIndicators(context);
    checkSlugs([...indicators.indicatorNames].map(([id, name]) => ({ id, name })));
    const observations = await exportObservations({
      ...context,
      noteTypeCategory: lookups.noteTypeCategory,
      areaIdByPholioCode: geography.areaIdByPholioCode,
      dimensionValueIds: dimensions.dimensionValueIds,
      indicatorIds: indicators.indicatorIds,
      indicatorEnteredAt: indicators.indicatorEnteredAt,
      countIsNumerator: indicators.countIsNumerator,
      supersededSentinelIndicators: options.supersededSentinelIndicators ?? [],
    });
    const tables: StageResult = {
      ...lookups.tables,
      ...geography.tables,
      ...dimensions.tables,
      ...indicators.tables,
      ...observations.tables,
    };
    for (const [table, file] of Object.entries(tables))
      console.log(`${table}: ${file?.rows.toLocaleString()} rows`);
    const missing = TABLES.filter((table) => !tables[table]);
    if (missing.length > 0) throw new Error(`Pholio export wrote no ${missing.join(', ')}`);

    await writeFile(
      join(options.outDir, 'source-manifest.json'),
      `${JSON.stringify(
        {
          source: {
            system: 'fingertips',
            environment: 'live',
            database: identity.database,
            snapshot_at: snapshotAt,
            cutoff_at: snapshotAt,
            profile_metadata: indicators.profileMetadata,
          },
          exported_indicators: tables.indicator?.rows,
          scanned_observations: observations.scannedObservations,
          source_observations: observations.sourceObservations,
          indicator_selection: options.indicatorSelection,
          indicator_name_mappings: indicators.indicatorNameMappings,
          excluded_indicators: [...context.excludedIndicators].sort((a, b) => a - b),
          excluded_non_approved_indicators: indicators.excludedNonApprovedIndicators,
          superseded_sentinel_indicators: [...(options.supersededSentinelIndicators ?? [])].sort(
            (a, b) => a - b,
          ),
          excluded_observations: observations.excludedObservations,
          observation_exclusions: observations.observationExclusions,
          source_csv_null: DATA_MIGRATION_NULL,
          tables,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await pool.close();
  }
}
