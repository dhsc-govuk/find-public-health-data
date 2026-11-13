import { DATA_MIGRATION_TABLES } from '@fphd/db-operations/data-migration-contract';

export const TABLES = DATA_MIGRATION_TABLES;

// Tags are fixed by position in the full Pholio table list, which includes value_type, unit,
// year_type, polarity and frequency (dropped from SEED_TABLES after later migrations) so that
// removing them does not shift the tags of tables that follow.
const TAGGED_TABLES = [
  'value_type',
  'unit',
  'year_type',
  'ci_method',
  'polarity',
  'frequency',
  'comparator_method',
  'data_source',
  'numerator_denominator_source',
  'dimension_type',
  'dimension_value',
  'area_type',
  'area',
  'area_relationship',
  'indicator',
  'indicator_version',
  'upload_batch',
  'note_type',
  'observation',
  'observation_dimension',
  'observation_note',
] as const;

export const TABLE_TAGS: Record<string, number> = Object.fromEntries(
  TAGGED_TABLES.map((table, index) => [table, index + 1]),
);

export const FOREIGN_KEYS: Partial<Record<(typeof TABLES)[number], Record<string, string>>> = {
  dimension_value: { dimension_type_id: 'dimension_type', parent_id: 'dimension_value' },
  area: { area_type_id: 'area_type' },
  area_relationship: { parent_area_id: 'area', child_area_id: 'area' },
  indicator_version: {
    indicator_id: 'indicator',
    upload_batch_id: 'upload_batch',
    ci_method_id: 'ci_method',
    comparator_method_id: 'comparator_method',
    data_source_id: 'data_source',
    numerator_source_id: 'numerator_denominator_source',
    denominator_source_id: 'numerator_denominator_source',
  },
  upload_batch: {
    indicator_id: 'indicator',
    indicator_version_id: 'indicator_version',
  },
  observation: {
    indicator_id: 'indicator',
    area_id: 'area',
    upload_batch_id: 'upload_batch',
  },
  observation_dimension: {
    observation_id: 'observation',
    dimension_value_id: 'dimension_value',
    dimension_type_id: 'dimension_type',
  },
  observation_note: { observation_id: 'observation', note_type_id: 'note_type' },
};

/** Each foreign-key column's position and the table it references; a missing one stops the rekey. */
export function foreignKeyIndexes(table: string, header: readonly string[]): [number, string][] {
  const fks = FOREIGN_KEYS[table as (typeof TABLES)[number]] ?? {};
  const missing = Object.keys(fks).filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new Error(`${table} is missing foreign-key columns: ${missing.join(', ')}`);
  }
  return Object.entries(fks).map(([column, target]) => [header.indexOf(column), target]);
}
