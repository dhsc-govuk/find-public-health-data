import type postgres from 'postgres';

import { receiverColumns, tableColumns } from './data-migration-actors.ts';
import { readCsvHeader } from './seeding.ts';

const LEGACY_SOURCE_COLUMNS = ['numerator_source_id', 'denominator_source_id'] as const;

interface TableColumnInfo {
  name: string;
  notNull: boolean;
  hasDefault: boolean;
}

async function tableColumnInfo(
  tx: postgres.TransactionSql,
  table: string,
): Promise<TableColumnInfo[]> {
  return tx<TableColumnInfo[]>`
    SELECT attname AS name, attnotnull AS "notNull", atthasdef AS "hasDefault"
    FROM pg_attribute
    WHERE attrelid = ${table}::regclass AND attnum > 0 AND NOT attisdropped
    ORDER BY attnum
  `;
}

export async function validateMigrationHeader(
  tx: postgres.TransactionSql,
  table: string,
  file: string,
): Promise<{ rawHeader: string[]; columns: string[] }> {
  const rawHeader = await readCsvHeader(file);
  const targetInfo = await tableColumnInfo(tx, table);
  const targetNames = new Set(targetInfo.map(({ name }) => name));
  const legacySet = new Set<string>(LEGACY_SOURCE_COLUMNS);

  const columns = tableColumns(
    table,
    table === 'indicator_version' ? rawHeader.filter((col) => !legacySet.has(col)) : rawHeader,
  );

  const unknown = columns.filter((col) => !targetNames.has(col));
  if (unknown.length > 0) {
    throw new Error(`${table} CSV has columns the target table does not: ${unknown.join(', ')}`);
  }

  const receiverOwned = columns.filter((col) => receiverColumns(table).includes(col));
  if (receiverOwned.length > 0) {
    throw new Error(
      `${table} CSV has columns only the receiver writes: ${receiverOwned.join(', ')}`,
    );
  }

  const columnSet = new Set([...columns, ...receiverColumns(table)]);
  const missing = targetInfo
    .filter(
      ({ name, notNull, hasDefault }) =>
        name === 'id' ||
        (table === 'indicator' && name === 'short_id') ||
        (table === 'area' && name === 'is_current') ||
        (table === 'indicator_version' && name === 'is_locked') ||
        (notNull && !hasDefault),
    )
    .map(({ name }) => name)
    .filter((name) => !columnSet.has(name));
  if (table === 'indicator_version') {
    missing.push(...LEGACY_SOURCE_COLUMNS.filter((column) => !rawHeader.includes(column)));
    const batchColumns = ['upload_batch_id', 'data_table_confirmed_at'];
    if (batchColumns.some((column) => columnSet.has(column))) {
      missing.push(...batchColumns.filter((column) => !columnSet.has(column)));
    }
  }
  if (missing.length > 0) {
    throw new Error(`${table} CSV is missing required columns: ${missing.join(', ')}`);
  }

  return { rawHeader, columns };
}
