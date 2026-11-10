import type postgres from 'postgres';

import { copyInto, type DataMigrationProgressReporter } from './data-migration-copy.ts';
import { validateMigrationHeader } from './data-migration-header.ts';
import { dataMigrationKey } from './data-migration-manifest.ts';
import { CORE_REFERENCE_TABLES, GEOGRAPHY_CORE_TABLES } from './seed-tables.ts';

const matches = {
  area_type: 'core.name = source.name',
  dimension_type: 'core.name = source.name',
  dimension_value: `core.name = source.name AND core.dimension_type_id = (
    SELECT core_id FROM core_dimension_type_map WHERE source_id = source.dimension_type_id
  )`,
  note_type: 'core.text = source.text',
  area: `core.code = source.code AND core.area_type_id = (
    SELECT core_id FROM core_area_type_map WHERE source_id = source.area_type_id
  )`,
} as const;

const references: Record<string, Record<string, string>> = {
  observation: { area_id: 'area' },
  observation_dimension: {
    dimension_type_id: 'dimension_type',
    dimension_value_id: 'dimension_value',
  },
  observation_note: { note_type_id: 'note_type' },
};

export async function stageReferenceMaps(
  tx: postgres.TransactionSql,
  directory: string,
  report: DataMigrationProgressReporter = () => {},
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of [...CORE_REFERENCE_TABLES, ...GEOGRAPHY_CORE_TABLES]) {
    const stage = `core_source_${table}`;
    const file = `${directory}/${table}.csv.gz`;
    const { rawHeader: columns } = await validateMigrationHeader(tx, table, file);
    await tx.unsafe(
      `CREATE TEMP TABLE "${stage}" (LIKE "${table}" INCLUDING DEFAULTS) ON COMMIT DROP`,
    );
    await copyInto(
      tx,
      stage,
      columns,
      file,
      `staging ${table}`,
      { table, phase: 'upsert' },
      report,
    );
    await tx.unsafe(`ALTER TABLE "${stage}" ADD PRIMARY KEY (id)`);
    const [loaded] = await tx.unsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "${stage}"`,
    );
    if (!loaded) throw new Error(`No staging count for ${table}`);
    counts[table] = loaded.count;
    if (table === 'area_relationship') continue;
    await tx.unsafe(`
      CREATE TEMP TABLE core_${table}_map ON COMMIT DROP AS
      SELECT source.id AS source_id, core.id AS core_id
      FROM "${stage}" source JOIN "${table}" core ON ${matches[table]}
    `);
    await tx.unsafe(`ALTER TABLE core_${table}_map ADD PRIMARY KEY (source_id)`);
    if (table === 'note_type') {
      const conflicts = await tx<{ text: string }[]>`
        SELECT source.text FROM core_source_note_type source
        JOIN note_type core ON core.text = source.text
        WHERE core.category <> source.category
        ORDER BY source.text LIMIT 20
      `;
      if (conflicts.length > 0) {
        throw new Error(
          `Note categories differ from core data: ${conflicts.map(({ text }) => text).join(', ')}`,
        );
      }
    }
  }
  return counts;
}

/** Rewrites the stage's column from the package's ids to the core ids its reference maps give. */
async function rewriteToCoreIds(
  tx: postgres.TransactionSql,
  stage: string,
  column: string,
  reference: string,
): Promise<void> {
  await tx.unsafe(`
    UPDATE "${stage}" s SET "${column}" = m.core_id
    FROM core_${reference}_map m WHERE s."${column}" = m.source_id
      AND s."${column}" IS DISTINCT FROM m.core_id
  `);
}

export async function remapReferenceColumns(
  tx: postgres.TransactionSql,
  table: string,
  stage: string,
): Promise<void> {
  for (const [column, reference] of Object.entries(references[table] ?? {})) {
    const missing = await tx.unsafe<{ id: string }[]>(`
      SELECT DISTINCT s."${column}" AS id FROM "${stage}" s
      WHERE s."${column}" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM core_${reference}_map m WHERE m.source_id = s."${column}")
      ORDER BY id LIMIT 20
    `);
    if (missing.length > 0) {
      throw new Error(
        `No core ${reference} for ${table}.${column} source ids: ${missing.map(({ id }) => id).join(', ')}. Update the core data and run \`db import-core-data\``,
      );
    }
    await rewriteToCoreIds(tx, stage, column, reference);
  }
  if (table === 'observation') {
    const missing = await tx.unsafe<{ id: string }[]>(`
      SELECT DISTINCT part.source_id AS id FROM "${stage}" s,
        unnest(string_to_array(s.dimension_key, ',')) part(source_id)
      WHERE NOT EXISTS (SELECT 1 FROM core_dimension_value_map m WHERE m.source_id::text = part.source_id)
      ORDER BY id LIMIT 20
    `);
    if (missing.length > 0) {
      throw new Error(
        `Observation dimension keys name unknown core values: ${missing.map(({ id }) => id).join(', ')}`,
      );
    }
    const [changed] = await tx<{ any: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM core_dimension_value_map WHERE source_id <> core_id) AS any
    `;
    if (!changed?.any) return;
    await tx.unsafe(`
      UPDATE "${stage}" s SET dimension_key = (
        SELECT string_agg(m.core_id::text, ',' ORDER BY m.core_id)
        FROM unnest(string_to_array(s.dimension_key, ',')) part(source_id)
        JOIN core_dimension_value_map m ON m.source_id::text = part.source_id
      ) WHERE s.dimension_key <> ''
    `);
  }
}

/**
 * Rewrites the reference columns in a delete stage's key to core ids, so the stage names rows as
 * the tables hold them, and says whether the key had any. Only a bridge's key has one: its
 * dimension type or note type.
 *
 * A deleted row may name a type that has since left the source's lists, and so has no row in this
 * package. Its id is kept as it is, which is still the core id, since core rows that came from
 * Fingertips keep their package ids. applyDeletes then checks that every staged row was deleted.
 */
export async function remapKeyColumns(
  tx: postgres.TransactionSql,
  table: string,
  stage: string,
): Promise<boolean> {
  const mapped = dataMigrationKey(table).flatMap((column) => {
    const reference = references[table]?.[column];
    return reference === undefined ? [] : [[column, reference] as const];
  });
  for (const [column, reference] of mapped) await rewriteToCoreIds(tx, stage, column, reference);
  return mapped.length > 0;
}

export function needsReferenceMapping(table: string): boolean {
  return table in references || table === 'observation';
}
