import { schema } from '@fphd/db';
import type postgres from 'postgres';

const { IMPORTED_INDICATOR_TEAM_ID, SYSTEM_USER_IDS } = schema;

/**
 * Packages name their writer as text, as the Pholio export always has, and the receiver loads it
 * as the PHOLIO migration user. A row the migration wrote is one that user wrote, so the checks
 * for publisher work compare the live tables' writers with this id.
 */
export const PACKAGE_ACTOR = 'pholio-migration';
export const MIGRATION_USER_ID = SYSTEM_USER_IDS.pholioMigration;

/** The columns naming a row's writer: the package's text, and a user id in the table. */
const ACTOR_COLUMNS: Record<string, { columns: readonly string[]; rows: string; role: string }> = {
  indicator_version: {
    columns: ['created_by', 'updated_by'],
    rows: 'versions',
    role: 'audit actor',
  },
  upload_batch: { columns: ['uploaded_by'], rows: 'upload batches', role: 'uploader' },
};

/** Columns only the package has: an observation's writer is its batch's uploader. */
const PACKAGE_ONLY_COLUMNS: Record<string, readonly string[]> = {
  observation: ['created_by'],
};

/**
 * Columns the receiver writes because packages never carry them, with the value each takes.
 * Imported indicators join the Fingertips team, which holds the indicators no publisher owns.
 */
const RECEIVER_COLUMNS: Record<string, Record<string, string>> = {
  indicator: { team_id: IMPORTED_INDICATOR_TEAM_ID },
};

/** Whether the table's rows need staging to load: their package shape differs from the table's. */
export function hasPackageShape(table: string): boolean {
  return table in ACTOR_COLUMNS || table in PACKAGE_ONLY_COLUMNS || table in RECEIVER_COLUMNS;
}

/** The columns the receiver writes into the table, which a package leaves out. */
export function receiverColumns(table: string): string[] {
  return Object.keys(RECEIVER_COLUMNS[table] ?? {});
}

/** The package columns that go into the table. */
export function tableColumns(table: string, columns: readonly string[]): string[] {
  const packageOnly = PACKAGE_ONLY_COLUMNS[table] ?? [];
  return columns.filter((column) => !packageOnly.includes(column));
}

/**
 * Alters a stage created LIKE its table to hold the package's rows: the writers as text, the
 * columns only the package has, and the receiver's values as the defaults of its own columns.
 */
export async function shapeStage(
  tx: postgres.TransactionSql,
  table: string,
  stage: string,
): Promise<void> {
  const alterations = [
    ...(ACTOR_COLUMNS[table]?.columns ?? []).map((column) => `ALTER COLUMN "${column}" TYPE text`),
    ...(PACKAGE_ONLY_COLUMNS[table] ?? []).map((column) => `ADD COLUMN "${column}" text`),
    ...Object.entries(RECEIVER_COLUMNS[table] ?? {}).map(
      ([column, value]) => `ALTER COLUMN "${column}" SET DEFAULT '${value}'`,
    ),
  ];
  if (alterations.length > 0) {
    await tx.unsafe(`ALTER TABLE "${stage}" ${alterations.join(', ')}`);
  }
}

/** Refuses staged rows written by anyone but the migration. */
export async function assertPackageActors(
  tx: postgres.TransactionSql,
  table: string,
  stage: string,
): Promise<void> {
  const actors = ACTOR_COLUMNS[table];
  if (actors === undefined) return;
  const others = actors.columns.map((column) => `"${column}" IS DISTINCT FROM $1`).join(' OR ');
  const [conflict] = await tx.unsafe<{ count: number }[]>(
    `SELECT count(*)::int AS count FROM "${stage}" WHERE ${others}`,
    [PACKAGE_ACTOR],
  );
  if (conflict?.count) {
    throw new Error(
      `Data migration ${actors.rows} must name ${PACKAGE_ACTOR} as their ${actors.role}`,
    );
  }
}

/**
 * The SQL that reads a staged column into the table: a writer becomes the migration's user, or
 * null, which the column refuses, for a writer assertPackageActors has not checked.
 */
export function stagedValue(table: string, column: string, alias: string): string {
  const value = `${alias}."${column}"`;
  return ACTOR_COLUMNS[table]?.columns.includes(column)
    ? `CASE ${value} WHEN '${PACKAGE_ACTOR}' THEN '${MIGRATION_USER_ID}'::uuid END`
    : value;
}
