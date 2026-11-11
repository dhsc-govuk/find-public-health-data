import type postgres from 'postgres';

import type { DataMigrationProgressReporter } from './data-migration-copy.ts';
import { applyDeletes, prepareVersionDeletes, stageDeletes } from './data-migration-deletes.ts';
import type { DataMigrationManifest } from './data-migration-manifest.ts';
import {
  DATA_MIGRATION_REFERENCE_TABLES,
  DATA_MIGRATION_TABLES,
} from './data-migration-manifest.ts';
import { assertMigrationPublisherRowsUnchanged } from './data-migration-publisher-work.ts';
import {
  applyRelationships,
  assertMigrationPublisherWorkUnchanged,
  readMigrationRelationships,
} from './data-migration-relationship-import.ts';
import { applyLegacySources } from './data-migration-sources.ts';
import {
  applyBaselineRows,
  applyIndicatorVersionRows,
  applyUpserts,
  applyVersionBatchPointers,
} from './data-migration-table-import.ts';
import { type LegacySourceMap, readLegacySourceMap } from './legacy-sources.ts';
import { stageReferenceMaps } from './reference-data-maps.ts';

export type {
  DataMigrationProgress,
  DataMigrationProgressReporter,
} from './data-migration-copy.ts';

const referenceTables = new Set(DATA_MIGRATION_REFERENCE_TABLES);
async function applyBaseline(
  tx: postgres.TransactionSql,
  directory: string,
  manifest: Extract<DataMigrationManifest, { kind: 'baseline' }>,
  report: DataMigrationProgressReporter,
  legacySourceMap: LegacySourceMap = readLegacySourceMap(),
): Promise<Record<string, { upserts: number; deletes: number }>> {
  for (const table of DATA_MIGRATION_TABLES) {
    if (referenceTables.has(table)) continue;
    const [row] = await tx.unsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "${table}"`,
    );
    if (Number(row?.count) !== 0) throw new Error(`Baseline target table ${table} is not empty`);
  }

  const changes: Record<string, { upserts: number; deletes: number }> = {};
  let indicatorVersionHasBatchPointers = false;
  for (const table of DATA_MIGRATION_TABLES) {
    const entry = manifest.tables[table];
    if (!entry) throw new Error(`Baseline has no ${table} entry`);
    if (referenceTables.has(table)) {
      changes[table] = { upserts: 0, deletes: 0 };
      continue;
    }
    if (table === 'indicator_version') {
      const { hasBatchPointers } = await applyIndicatorVersionRows(
        tx,
        directory,
        'baseline',
        report,
      );
      indicatorVersionHasBatchPointers = hasBatchPointers;
      const [row] = await tx.unsafe<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM indicator_version`,
      );
      if (Number(row?.count) !== entry.rows)
        throw new Error(`Baseline row count failed for indicator_version`);
      await applyLegacySources(tx, directory, legacySourceMap);
      changes[table] = { upserts: entry.rows, deletes: 0 };
      continue;
    }
    await applyBaselineRows(tx, table, `${directory}/${entry.file}`, report);
    const [row] = await tx.unsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "${table}"`,
    );
    if (Number(row?.count) !== entry.rows)
      throw new Error(`Baseline row count failed for ${table}`);
    changes[table] = { upserts: entry.rows, deletes: 0 };
  }
  if (indicatorVersionHasBatchPointers) await applyVersionBatchPointers(tx);
  return changes;
}

async function applyIncremental(
  tx: postgres.TransactionSql,
  directory: string,
  manifest: Extract<DataMigrationManifest, { kind: 'incremental' }>,
  report: DataMigrationProgressReporter,
  legacySourceMap: LegacySourceMap = readLegacySourceMap(),
): Promise<Record<string, { upserts: number; deletes: number }>> {
  // Move changed children onto any new parent rows before deleting parents no longer in the
  // source snapshot. Deleting first would fail when an unchanged row still referenced a parent
  // until its upsert changed the foreign key.
  let indicatorVersionHasBatchPointers = false;
  for (const table of DATA_MIGRATION_TABLES) {
    if (referenceTables.has(table)) continue;
    const entry = manifest.tables[table];
    if (!entry) throw new Error(`Incremental package has no ${table} entry`);
    if (table === 'indicator_version') {
      const { hasBatchPointers } = await applyIndicatorVersionRows(tx, directory, 'upsert', report);
      indicatorVersionHasBatchPointers = hasBatchPointers;
      const [staged] = await tx.unsafe<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM migration_source_indicator_version`,
      );
      if (Number(staged?.count) !== entry.upserts.rows) {
        throw new Error(
          `indicator_version staged ${staged?.count ?? 0} upserts; package declares ${entry.upserts.rows}`,
        );
      }
      await applyLegacySources(tx, directory, legacySourceMap);
      continue;
    }
    await applyUpserts(tx, table, `${directory}/${entry.upserts.file}`, entry.upserts.rows, report);
  }
  if (indicatorVersionHasBatchPointers) await applyVersionBatchPointers(tx);
  for (const table of DATA_MIGRATION_TABLES) {
    if (referenceTables.has(table)) continue;
    const entry = manifest.tables[table];
    if (!entry) throw new Error(`Incremental package has no ${table} entry`);
    await stageDeletes(tx, table, `${directory}/${entry.deletes.file}`, entry.deletes.rows, report);
  }
  for (const table of DATA_MIGRATION_TABLES) {
    if (referenceTables.has(table)) continue;
    await assertMigrationPublisherRowsUnchanged(
      tx,
      table,
      `data_migration_delete_${table}`,
      'delete',
    );
  }
  await prepareVersionDeletes(tx);
  for (const table of [...DATA_MIGRATION_TABLES].reverse()) {
    if (referenceTables.has(table)) continue;
    const entry = manifest.tables[table];
    if (!entry) throw new Error(`Incremental package has no ${table} entry`);
    await applyDeletes(tx, table, entry.deletes.rows);
  }
  return Object.fromEntries(
    DATA_MIGRATION_TABLES.map((table) => {
      const entry = manifest.tables[table];
      if (!entry) throw new Error(`Incremental package has no ${table} entry`);
      return [
        table,
        referenceTables.has(table)
          ? { upserts: 0, deletes: 0 }
          : { upserts: entry.upserts.rows, deletes: entry.deletes.rows },
      ];
    }),
  );
}

export interface ApplyDataMigrationResult {
  applied: boolean;
  changes: Record<string, { upserts: number; deletes: number }>;
}

export async function applyDataMigration(
  tx: postgres.TransactionSql,
  directory: string,
  manifest: DataMigrationManifest,
  packageSha256: string,
  report: DataMigrationProgressReporter = () => {},
): Promise<ApplyDataMigrationResult> {
  await tx`SELECT pg_advisory_xact_lock(hashtext('fphd-data-migration'))`;
  const [existing] = await tx<
    { packageSha256: string; tableChanges: ApplyDataMigrationResult['changes'] }[]
  >`
    SELECT package_sha256 AS "packageSha256", table_changes AS "tableChanges"
    FROM data_migration WHERE id = ${manifest.migration_id}
  `;
  if (existing) {
    if (existing.packageSha256 !== packageSha256) {
      throw new Error(
        `Migration ${manifest.migration_id} was already applied with another package`,
      );
    }
    return { applied: false, changes: existing.tableChanges };
  }

  const [latest] = await tx<{ id: string; cutoff: Date }[]>`
    SELECT id, source_cutoff_at AS cutoff
    FROM data_migration ORDER BY source_cutoff_at DESC, applied_at DESC LIMIT 1
  `;
  if (manifest.kind === 'baseline') {
    if (latest) throw new Error('A baseline can only be applied before any other data migration');
  } else {
    if (!latest || latest.id !== manifest.predecessor) {
      throw new Error(
        `Incremental predecessor ${manifest.predecessor} is not the latest migration`,
      );
    }
    if (new Date(manifest.source.cutoff_at) <= latest.cutoff) {
      throw new Error('Incremental cutoff must be strictly later than its predecessor');
    }
  }

  // Keep publisher writes outside the package's version checks and relationship replacement.
  await tx`
    LOCK TABLE indicator, indicator_version, indicator_version_topic,
      indicator_version_classification IN SHARE ROW EXCLUSIVE MODE
  `;

  const relationships = await readMigrationRelationships(directory, manifest);
  if (manifest.kind === 'incremental') {
    await assertMigrationPublisherWorkUnchanged(tx, relationships);
  }
  const referenceCounts = await stageReferenceMaps(tx, directory, report);
  for (const [table, count] of Object.entries(referenceCounts)) {
    const expected =
      manifest.kind === 'baseline'
        ? manifest.tables[table]?.rows
        : manifest.tables[table]?.upserts.rows;
    if (count !== expected)
      throw new Error(`${table} staged ${count} reference rows; package declares ${expected}`);
  }
  const changes =
    manifest.kind === 'baseline'
      ? await applyBaseline(tx, directory, manifest, report)
      : await applyIncremental(tx, directory, manifest, report);
  await applyRelationships(tx, manifest, relationships, report);
  await tx.unsafe(
    "SELECT setval('indicator_short_id_seq', GREATEST(99999, (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM indicator_short_id_seq), COALESCE((SELECT max(short_id) FROM indicator), 99999)), true)",
  );
  await tx`
    INSERT INTO data_migration
      (id, kind, package_sha256, predecessor_id, source_snapshot_at, source_cutoff_at, table_changes)
    VALUES
      (${manifest.migration_id}, ${manifest.kind}, ${packageSha256}, ${manifest.predecessor},
       ${manifest.source.snapshot_at}, ${manifest.source.cutoff_at}, ${tx.json(changes)})
  `;
  return { applied: true, changes };
}
