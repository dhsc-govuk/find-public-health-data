import { schema } from '@fphd/db';
import type postgres from 'postgres';
import {
  assertPackageActors,
  hasPackageShape,
  MIGRATION_USER_ID,
  shapeStage,
  stagedValue,
} from './data-migration-actors.ts';
import {
  copyInto,
  type DataMigrationProgressReporter,
  quoteIdentifiers,
} from './data-migration-copy.ts';
import { validateMigrationHeader } from './data-migration-header.ts';
import { assertMigrationPublisherRowsUnchanged } from './data-migration-publisher-work.ts';
import { needsReferenceMapping, remapReferenceColumns } from './reference-data-maps.ts';
import { readCsvHeader } from './seeding.ts';

const { UNPUBLISHED_STATUS_LITERALS } = schema;

const PHOLIO_CI_METHOD_NAMES: Record<string, string> = {
  'Normal approximation': 'Wald normal approximation',
  'Other method - see below': 'Other method',
};

// The core rows are already present with fixed UUIDs from packages/db-operations/data/*.json.
interface CoreDataLookup {
  table: 'ci_method' | 'comparator_method';
  column: 'ci_method_id' | 'comparator_method_id';
  renames: Record<string, string>;
}

const CORE_DATA_LOOKUPS: CoreDataLookup[] = [
  { table: 'ci_method', column: 'ci_method_id', renames: PHOLIO_CI_METHOD_NAMES },
  { table: 'comparator_method', column: 'comparator_method_id', renames: {} },
];

/**
 * Stages the package's rows for a core data table and builds a temp map from source IDs to the
 * live core data IDs of the same name, ready for indicator_version to join through. Mirrors
 * seeding.ts's mapToCoreData. Maps only the rows the staged versions name, so it runs after
 * applyIndicatorVersionRows has staged migration_source_indicator_version.
 */
async function stageCoreDataMap(
  tx: postgres.TransactionSql,
  { table, column, renames }: CoreDataLookup,
  directory: string,
): Promise<void> {
  const file = `${directory}/${table}.csv.gz`;
  const rawHeader = await readCsvHeader(file);
  const columnDefs = rawHeader.map((c) => `"${c.replaceAll('"', '""')}" text`).join(', ');
  await tx.unsafe(`CREATE TEMP TABLE migration_source_${table} (${columnDefs}) ON COMMIT DROP`);
  await copyInto(
    tx,
    `migration_source_${table}`,
    rawHeader,
    file,
    `staging ${table}`,
    { table, phase: 'upsert' },
    () => {},
  );

  const sourceRows = await tx.unsafe<{ id: string; name: string }[]>(`
    SELECT DISTINCT s.id, s.name FROM migration_source_${table} s
    JOIN migration_source_indicator_version v ON v.${column} = s.id::uuid
  `);
  const coreRows = await tx.unsafe<{ id: string; name: string }[]>(
    `SELECT id::text AS id, name FROM "${table}"`,
  );
  const coreIds = new Map(coreRows.map(({ id, name }) => [name, id]));
  const mapping = sourceRows.map(({ id, name }) => ({
    sourceId: id,
    coreId: coreIds.get(renames[name] ?? name),
    name,
  }));
  const unmatched = mapping.filter(({ coreId }) => coreId === undefined).map(({ name }) => name);
  if (unmatched.length > 0) {
    throw new Error(
      `No core ${table} for: ${unmatched.join(', ')}. Add it to the core data file and run \`db import-core-data\``,
    );
  }

  await tx.unsafe(
    `CREATE TEMP TABLE migration_${table}_map (source_id uuid, core_id uuid) ON COMMIT DROP`,
  );
  if (mapping.length > 0) {
    await tx`INSERT INTO ${tx(`migration_${table}_map`)} ${tx(
      mapping.map(({ sourceId, coreId }) => ({ source_id: sourceId, core_id: coreId })),
    )}`;
  }

  const [dangling] = await tx.unsafe<{ count: number }[]>(`
    SELECT count(*)::int AS count FROM migration_source_indicator_version v
    WHERE v.${column} IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM migration_${table}_map m WHERE m.source_id = v.${column})
  `);
  if (dangling?.count) {
    throw new Error(`${dangling.count} migrated versions name a ${table} the source does not hold`);
  }
}

/**
 * Stages indicator_version rows (with legacy source and core data columns), builds the core data
 * maps, then inserts into indicator_version with FK references rewritten to core data IDs. Mirrors
 * seeding.ts's loadIndicatorVersions.
 */
export async function applyIndicatorVersionRows(
  tx: postgres.TransactionSql,
  directory: string,
  phase: 'baseline' | 'upsert',
  report: DataMigrationProgressReporter,
): Promise<{ hasBatchPointers: boolean }> {
  const file = `${directory}/indicator_version.csv.gz`;
  const { rawHeader, columns } = await validateMigrationHeader(tx, 'indicator_version', file);

  await tx.unsafe(
    `CREATE TEMP TABLE migration_source_indicator_version (LIKE indicator_version INCLUDING DEFAULTS) ON COMMIT DROP`,
  );
  await tx.unsafe(
    `ALTER TABLE migration_source_indicator_version ADD COLUMN numerator_source_id uuid, ADD COLUMN denominator_source_id uuid`,
  );
  await shapeStage(tx, 'indicator_version', 'migration_source_indicator_version');
  await copyInto(
    tx,
    'migration_source_indicator_version',
    rawHeader,
    file,
    `staging indicator_version`,
    { table: 'indicator_version', phase },
    report,
  );

  const [unpublished] = await tx<{ count: number }[]>`
    SELECT count(*)::int AS count FROM migration_source_indicator_version
    WHERE status IS DISTINCT FROM 'published'
  `;
  if (unpublished?.count) {
    throw new Error('Data migration contains a non-published indicator version');
  }

  const moved = await tx<{ id: string }[]>`
    SELECT existing.id FROM migration_source_indicator_version staged
    JOIN indicator_version existing ON existing.id = staged.id
    WHERE existing.indicator_id <> staged.indicator_id
    ORDER BY existing.id
    LIMIT 20
  `;
  if (moved.length > 0) {
    throw new Error(
      `Data migration would move indicator versions to another indicator (ids: ${moved.map(({ id }) => id).join(', ')})`,
    );
  }

  const [draftConflict] = await tx<{ count: number }[]>`
    SELECT count(*)::int AS count FROM migration_source_indicator_version staged
    JOIN indicator_version existing ON existing.id = staged.id
    WHERE existing.status <> 'published'
  `;
  if (draftConflict?.count) {
    throw new Error('Data migration would overwrite a non-published indicator version');
  }

  await assertPackageActors(tx, 'indicator_version', 'migration_source_indicator_version');
  const conflicts = await tx<{ shortId: number }[]>`
    SELECT DISTINCT i.short_id AS "shortId"
    FROM migration_source_indicator_version staged
    JOIN indicator i ON i.id = staged.indicator_id
    JOIN indicator_version existing ON existing.indicator_id = i.id
    WHERE existing.status IN (${tx.unsafe(UNPUBLISHED_STATUS_LITERALS)}) OR (
      (existing.id = staged.id OR existing.id IN (SELECT id FROM current_published_version))
      AND (existing.created_by IS DISTINCT FROM ${MIGRATION_USER_ID}
        OR existing.updated_by IS DISTINCT FROM ${MIGRATION_USER_ID})
    )
    ORDER BY i.short_id
  `;
  if (conflicts.length > 0) {
    throw new Error(
      `Data migration conflicts with FPHD publisher work on indicators: ${conflicts.map(({ shortId }) => shortId).join(', ')}`,
    );
  }

  for (const lookup of CORE_DATA_LOOKUPS) {
    await stageCoreDataMap(tx, lookup, directory);
  }

  const mapped = new Map<string, string>(
    CORE_DATA_LOOKUPS.map(({ table, column }) => [column, `migration_${table}_map.core_id`]),
  );
  const insertColumns = columns.filter(
    (c) => c !== 'upload_batch_id' && c !== 'data_table_confirmed_at',
  );
  const columnList = quoteIdentifiers(insertColumns);
  const selectList = insertColumns
    .map((c) => mapped.get(c) ?? stagedValue('indicator_version', c, 'v'))
    .join(', ');
  const joins = CORE_DATA_LOOKUPS.map(
    ({ table, column }) =>
      `LEFT JOIN migration_${table}_map ON migration_${table}_map.source_id = v.${column}`,
  ).join('\n    ');

  if (phase === 'baseline') {
    await tx.unsafe(`
      INSERT INTO indicator_version (${columnList})
      SELECT ${selectList} FROM migration_source_indicator_version v
      ${joins}
    `);
  } else {
    const assignments = insertColumns
      .filter((c) => c !== 'id')
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(', ');
    const conflict = assignments.length === 0 ? 'DO NOTHING' : `DO UPDATE SET ${assignments}`;
    await tx.unsafe(`
      INSERT INTO indicator_version (${columnList})
      SELECT ${selectList} FROM migration_source_indicator_version v
      ${joins}
      ON CONFLICT (id) ${conflict}
    `);
  }

  return { hasBatchPointers: columns.includes('upload_batch_id') };
}

/** Connects staged versions after their batches exist, resolving their mutual foreign keys. */
export async function applyVersionBatchPointers(tx: postgres.TransactionSql): Promise<void> {
  await tx`
    UPDATE indicator_version v
    SET upload_batch_id = staged.upload_batch_id,
        data_table_confirmed_at = staged.data_table_confirmed_at
    FROM migration_source_indicator_version staged
    WHERE v.id = staged.id
  `;
}

export async function applyUpserts(
  tx: postgres.TransactionSql,
  table: string,
  file: string,
  expected: number,
  report: DataMigrationProgressReporter,
): Promise<void> {
  const { rawHeader, columns } = await validateMigrationHeader(tx, table, file);

  const stage = `data_migration_upsert_${table}`;
  await tx.unsafe(
    `CREATE TEMP TABLE "${stage}" (LIKE "${table}" INCLUDING DEFAULTS) ON COMMIT DROP`,
  );
  await shapeStage(tx, table, stage);
  await copyInto(
    tx,
    stage,
    rawHeader,
    file,
    `loading ${table} upserts`,
    { table, phase: 'upsert' },
    report,
  );
  const [staged] = await tx.unsafe<{ count: number }[]>(
    `SELECT count(*)::int AS count FROM "${stage}"`,
  );
  if (Number(staged?.count) !== expected) {
    throw new Error(`${table} staged ${staged?.count ?? 0} upserts; package declares ${expected}`);
  }
  await assertPackageActors(tx, table, stage);
  await assertMigrationPublisherRowsUnchanged(tx, table, stage, 'upsert');
  await remapReferenceColumns(tx, table, stage);
  const assignments = columns
    .filter((column) => column !== 'id')
    .map((column) => `"${column}" = EXCLUDED."${column}"`)
    .join(', ');
  const conflict = assignments.length === 0 ? 'DO NOTHING' : `DO UPDATE SET ${assignments}`;
  await tx.unsafe(
    `INSERT INTO "${table}" (${quoteIdentifiers(columns)}) SELECT ${selectStaged(table, columns)} FROM "${stage}" s ON CONFLICT (id) ${conflict}`,
  );
}

function selectStaged(table: string, columns: readonly string[]): string {
  return columns.map((column) => stagedValue(table, column, 's')).join(', ');
}

/**
 * Loads a baseline table's rows. Most are copied straight in; a table whose package rows differ
 * from its own, by naming their writer or carrying a column it lacks, is staged first.
 */
export async function applyBaselineRows(
  tx: postgres.TransactionSql,
  table: string,
  file: string,
  report: DataMigrationProgressReporter,
): Promise<void> {
  const { rawHeader, columns } = await validateMigrationHeader(tx, table, file);
  const progress = { table, phase: 'baseline' } as const;
  if (!hasPackageShape(table) && !needsReferenceMapping(table)) {
    await copyInto(tx, table, columns, file, `COPY into ${table}`, progress, report);
    return;
  }

  const stage = `data_migration_baseline_${table}`;
  await tx.unsafe(
    `CREATE TEMP TABLE "${stage}" (LIKE "${table}" INCLUDING DEFAULTS) ON COMMIT DROP`,
  );
  await shapeStage(tx, table, stage);
  // The table is complete once its rows are in it, not once the file is copied.
  const staging: DataMigrationProgressReporter = (event) => {
    if (event.state !== 'complete') report(event);
  };
  await copyInto(tx, stage, rawHeader, file, `staging ${table}`, progress, staging);
  await assertPackageActors(tx, table, stage);
  await remapReferenceColumns(tx, table, stage);
  // For observations the insert takes longer than the copy, so it says when it starts.
  report({ ...progress, state: 'inserting' });
  await tx.unsafe(
    `INSERT INTO "${table}" (${quoteIdentifiers(columns)}) SELECT ${selectStaged(table, columns)} FROM "${stage}" s`,
  );
  report({ ...progress, state: 'complete' });
  // Observations are most of a baseline, so their copy goes once they are in.
  await tx.unsafe(`DROP TABLE "${stage}"`);
}
