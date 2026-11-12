import { schema } from '@fphd/db';
import type postgres from 'postgres';

import { MIGRATION_USER_ID } from './data-migration-actors.ts';
import {
  copyInto,
  type DataMigrationProgressReporter,
  quoteIdentifiers,
} from './data-migration-copy.ts';
import { validateMigrationHeader } from './data-migration-header.ts';
import { dataMigrationKey } from './data-migration-manifest.ts';
import { upsertStage } from './data-migration-table-import.ts';
import { remapKeyColumns } from './reference-data-maps.ts';

const { UNPUBLISHED_STATUS_LITERALS } = schema;

const VERSION_CHILD_TABLES = [
  'indicator_version_topic',
  'indicator_version_classification',
  'indicator_version_source',
] as const;

export async function stageDeletes(
  tx: postgres.TransactionSql,
  table: string,
  file: string,
  expected: number,
  report: DataMigrationProgressReporter,
): Promise<void> {
  const stage = `data_migration_delete_${table}`;
  const key = dataMigrationKey(table);
  const keyColumns = key.map((column) => `${quoteIdentifiers([column])} uuid`).join(', ');
  await tx.unsafe(
    `CREATE TEMP TABLE "${stage}" (${keyColumns}, PRIMARY KEY (${quoteIdentifiers(key)})) ON COMMIT DROP`,
  );
  const { columns } = await validateMigrationHeader(tx, stage, file);
  await copyInto(
    tx,
    stage,
    columns,
    file,
    `loading ${table} deletes`,
    { table, phase: 'delete' },
    report,
  );
  const [staged] = await tx.unsafe<{ count: number }[]>(
    `SELECT count(*)::int AS count FROM "${stage}"`,
  );
  if (Number(staged?.count) !== expected) {
    throw new Error(`${table} staged ${staged?.count ?? 0} deletes; package declares ${expected}`);
  }
  if (await remapKeyColumns(tx, table, stage)) {
    // Two package type ids can map to one core row, as when the source drops a note type and
    // lists another of the same text. The increment then deletes the row under the old id and
    // upserts it under the new one. The upsert keeps the row, so its delete is dropped here.
    const matched = key
      .map((column) => `d.${quoteIdentifiers([column])} = u.${quoteIdentifiers([column])}`)
      .join(' AND ');
    await tx.unsafe(`DELETE FROM "${stage}" d USING "${upsertStage(table)}" u WHERE ${matched}`);
  }
}

export async function prepareVersionDeletes(tx: postgres.TransactionSql): Promise<void> {
  const stage = 'data_migration_delete_indicator_version';
  const [unpublished] = await tx.unsafe<{ count: number }[]>(`
    SELECT count(*)::int AS count FROM indicator_version
    WHERE id IN (SELECT id FROM "${stage}") AND status <> 'published'
  `);
  if (unpublished?.count) {
    throw new Error('Data migration would delete a non-published indicator version');
  }
  const conflicts = await tx<{ shortId: number }[]>`
    SELECT DISTINCT i.short_id AS "shortId"
    FROM indicator i JOIN indicator_version deleting ON deleting.indicator_id = i.id
    WHERE deleting.id IN (SELECT id FROM data_migration_delete_indicator_version)
      AND EXISTS (
        SELECT 1 FROM indicator_version v WHERE v.indicator_id = i.id
          AND (v.status IN (${tx.unsafe(UNPUBLISHED_STATUS_LITERALS)})
            OR v.created_by IS DISTINCT FROM ${MIGRATION_USER_ID}
            OR v.updated_by IS DISTINCT FROM ${MIGRATION_USER_ID})
      )
    ORDER BY i.short_id
  `;
  if (conflicts.length > 0) {
    throw new Error(
      `Data migration deletion conflicts with FPHD publisher work on indicators: ${conflicts.map(({ shortId }) => shortId).join(', ')}`,
    );
  }
  // Publisher links and age ranges are retained even when the source withdraws their version.
  const [published] = await tx.unsafe<{ count: number }[]>(`
    SELECT (SELECT count(*) FROM indicator_version_link WHERE indicator_version_id IN (SELECT id FROM "${stage}"))
      + (SELECT count(*) FROM indicator_version_age_range WHERE indicator_version_id IN (SELECT id FROM "${stage}"))
      AS count
  `);
  if (Number(published?.count) > 0) {
    throw new Error(
      `${published?.count} publisher links or age ranges belong to indicator versions the source no longer holds`,
    );
  }
  // The migration wrote these, and re-applies topics and classifications once the deletes are done.
  for (const child of VERSION_CHILD_TABLES) {
    await tx.unsafe(
      `DELETE FROM ${child} WHERE indicator_version_id IN (SELECT id FROM "${stage}")`,
    );
  }
  await tx`
    UPDATE indicator_version SET upload_batch_id = NULL, data_table_confirmed_at = NULL
    WHERE id IN (SELECT id FROM data_migration_delete_indicator_version)
  `;
}

/** Deletes the staged rows, each of which must be in the table. */
export async function applyDeletes(tx: postgres.TransactionSql, table: string): Promise<void> {
  const stage = `data_migration_delete_${table}`;
  const key = quoteIdentifiers(dataMigrationKey(table));
  const [staged] = await tx.unsafe<{ count: number }[]>(
    `SELECT count(*)::int AS count FROM "${stage}"`,
  );
  const expected = Number(staged?.count);
  // A key of one column reads as the bare id, and a key of several as a row such as (a,b).
  const deleting =
    expected > 0
      ? await tx.unsafe<{ id: string }[]>(
          `SELECT (${key})::text AS id FROM "${stage}" ORDER BY ${key} LIMIT 20`,
        )
      : [];
  let result: { count: number };
  try {
    result = await tx.unsafe(
      `DELETE FROM "${table}" WHERE (${key}) IN (SELECT ${key} FROM "${stage}")`,
    );
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      throw new Error(
        `${table} deletion is blocked by retained references (ids: ${deleting.map(({ id }) => id).join(', ')}): ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    throw error;
  }
  if (result.count !== expected) {
    throw new Error(`${table} deleted ${result.count} rows; ${expected} were staged`);
  }
}
