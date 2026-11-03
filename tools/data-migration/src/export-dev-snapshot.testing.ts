import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_MIGRATION_NULL } from '@fphd/db-operations/data-migration-contract';
import { type ExportRow, TableWriter } from './pholio/table-writer.ts';
import { TABLES } from './tables.ts';

export const sourceTimestamp = '2020-01-01T00:00:00.000Z';
export const sourceConfirmation = '2020-01-02T00:00:00.000Z';

/** A small SQL-export fixture with the recorded B counts accounted for by explicit exclusions. */
export async function writeDevelopmentSource(outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const relationships = JSON.parse(
    await readFile(
      new URL(
        '../../../packages/db-operations/data/published-indicator-topics.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { indicators: number[] };
  const ids = new Set(relationships.indicators);
  for (let id = 1; ids.size < 1325; id++) ids.add(id);
  const indicators = [...ids].sort((a, b) => a - b);
  const rows: Record<string, ExportRow[]> = {
    ci_method: [{ id: 1, name: "Byar's method" }],
    comparator_method: [{ id: 1, name: 'Confidence intervals overlapping reference value (95.0)' }],
    data_source: [{ id: 1, name: 'Fixture data source' }],
    numerator_denominator_source: [{ id: 1, name: 'Unused fixture legacy source' }],
    dimension_type: [{ id: 1, name: ' Sex ', dimension_class: 'core', is_required: true }],
    dimension_value: [
      {
        id: 1,
        dimension_type_id: 1,
        name: ' Female ',
        code: '2',
        sort_order: 0,
        is_aggregate: false,
      },
    ],
    area_type: [{ id: 1, name: 'LA unchanged', hierarchy_type: 'Administrative', level: 1 }],
    area: [
      {
        id: 1,
        code: 'fixture-parent',
        name: 'Parent area',
        area_type_id: 1,
        valid_from: null,
        is_current: true,
      },
      {
        id: 2,
        code: 'fixture-child',
        name: 'Child area',
        area_type_id: 1,
        valid_from: null,
        is_current: true,
      },
    ],
    area_relationship: [{ id: 1, parent_area_id: 1, child_area_id: 2, valid_from: null }],
    indicator: indicators.map((id) => ({ id, created_at: sourceTimestamp })),
    indicator_version: indicators.map((id) => ({
      id,
      indicator_id: id,
      name: `Indicator ${id}`,
      status: 'published',
      published_at: sourceTimestamp,
      upload_batch_id: id,
      data_table_confirmed_at: sourceConfirmation,
      ci_method_id: 1,
      comparator_method_id: 1,
      created_at: sourceTimestamp,
      updated_at: sourceTimestamp,
      created_by: 'pholio-migration',
      updated_by: 'pholio-migration',
    })),
    upload_batch: indicators.map((id) => ({
      id,
      indicator_id: id,
      indicator_version_id: id,
      original_filename: 'pholio-migration',
      uploaded_by: 'pholio-migration',
      uploaded_at: sourceTimestamp,
      status: 'processed',
    })),
    note_type: [{ id: 1, text: ' Suppressed ', category: 'disclosure' }],
    observation: [
      {
        id: 2,
        indicator_id: 108,
        area_id: 2,
        from_date: '2025-01-01',
        to_date: '2025-12-31',
        value: 10,
        upload_batch_id: 108,
        dimension_key: '1',
        created_at: sourceTimestamp,
        created_by: 'pholio-migration',
        published_at: sourceTimestamp,
      },
    ],
    observation_dimension: [
      { id: 8, observation_id: 2, dimension_value_id: 1, dimension_type_id: 1 },
    ],
    observation_note: [{ id: 2, observation_id: 2, note_type_id: 1 }],
  };
  const tables: Record<string, unknown> = {};
  for (const table of TABLES) {
    const writer = new TableWriter(outDir, table);
    await writer.writeAll(rows[table] ?? []);
    tables[table] = await writer.close();
  }
  await writeFile(
    join(outDir, 'source-manifest.json'),
    JSON.stringify({
      exported_indicators: 1325,
      source_observations: 29656329,
      excluded_observations: 29656328,
      source_csv_null: DATA_MIGRATION_NULL,
      tables,
    }),
  );
}
