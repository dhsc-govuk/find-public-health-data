import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import { DATA_MIGRATION_NULL } from '@fphd/db-operations/data-migration-contract';
import mssql from 'mssql';
import { encodeRow } from './csv.ts';
import { ensureDirectory } from './files.ts';
import { translateFrequency, translatePolarity } from './fingertips-lookups.ts';
import { notesAndCaveats } from './notes-and-caveats.ts';
import { unitValues, valueTypeId } from './pholio/value-type-and-unit.ts';
import { yearTypeValues } from './pholio/year-type.ts';
import { rekeyDirectory } from './prepare-baseline.ts';
import { ACTOR_COLUMNS, actorUserId } from './seed-writers.ts';

const indicators = [108, 40501, 90366, 90851, 92026, 92033, 92443, 92708, 93622, 94194];
const areaTypes = [6, 15, 160, 170, 180];
const indicatorList = indicators.join(',');
const areaTypeList = areaTypes.join(',');
const observationWhere = `o.indicator_id IN (${indicatorList}) AND o.area_id IN (SELECT id FROM area WHERE area_type_id IN (${areaTypeList})) AND o.from_date >= CASE WHEN o.indicator_id = 92708 THEN '2021-01-01' ELSE '2015-01-01' END`;
const observationColumns =
  'id,indicator_id,area_id,from_date,to_date,value,count,denominator,denominator_2,lower_ci_95,upper_ci_95,lower_ci_998,upper_ci_998,upload_batch_id,created_at,created_by';

// Tables that can be streamed directly as-is (shape matches the target schema).
const streamingQueries: readonly [string, string][] = [
  ['ci_method', 'SELECT id,name,description FROM ci_method'],
  ['polarity', 'SELECT id,name FROM polarity'],
  ['frequency', 'SELECT id,name FROM frequency'],
  ['comparator_method', 'SELECT id,name FROM comparator_method'],
  ['data_source', 'SELECT id,name,url FROM data_source'],
  ['numerator_denominator_source', 'SELECT id,name,url FROM numerator_denominator_source'],
  [
    'dimension_type',
    'SELECT id,name,dimension_class,classification_scheme,granularity,is_required FROM dimension_type',
  ],
  [
    'dimension_value',
    'SELECT id,dimension_type_id,parent_id,name,code,sort_order,is_aggregate FROM dimension_value',
  ],
  ['area_type', 'SELECT id,name,hierarchy_type FROM area_type'],
  [
    'area',
    `SELECT id,code,name,area_type_id,valid_from,valid_to FROM area WHERE area_type_id IN (${areaTypeList})`,
  ],
  [
    'area_relationship',
    `SELECT id,parent_area_id,child_area_id,valid_from,valid_to FROM area_relationship WHERE parent_area_id IN (SELECT id FROM area WHERE area_type_id IN (${areaTypeList})) AND child_area_id IN (SELECT id FROM area WHERE area_type_id IN (${areaTypeList}))`,
  ],
  [
    'upload_batch',
    `SELECT id,indicator_id,original_filename,uploaded_by,uploaded_at,status,validation_result FROM upload_batch WHERE indicator_id IN (${indicatorList})`,
  ],
  ['note_type', 'SELECT id,text,category FROM note_type'],
  ['observation', `SELECT ${observationColumns} FROM observation o WHERE ${observationWhere}`],
  [
    'observation_dimension',
    `SELECT od.id,od.observation_id,od.dimension_value_id,dv.dimension_type_id FROM observation_dimension od JOIN dimension_value dv ON dv.id = od.dimension_value_id JOIN observation o ON o.id = od.observation_id WHERE ${observationWhere}`,
  ],
  [
    'observation_note',
    `SELECT n.id,n.observation_id,n.note_type_id FROM observation_note n JOIN observation o ON o.id = n.observation_id WHERE ${observationWhere}`,
  ],
];

function valueForCsv(table: string, column: string, value: unknown): string | number {
  if (ACTOR_COLUMNS[table]?.includes(column)) return actorUserId(table, value);
  if (value === null || value === undefined) return DATA_MIGRATION_NULL;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 't' : 'f';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function streamQuery(
  pool: mssql.ConnectionPool,
  table: string,
  query: string,
  outDirectory: string,
): Promise<number> {
  const output = createGzip({ level: 1 });
  const destination = createWriteStream(join(outDirectory, `${table}.csv.gz`));
  output.pipe(destination);
  const request = pool.request();
  request.stream = true;
  let columns: string[] = [];
  let rows = 0;
  await new Promise<void>((resolve, reject) => {
    request.on('recordset', (recordset) => {
      columns = Object.keys(recordset);
      output.write(encodeRow(columns));
    });
    request.on('row', (row: Record<string, unknown>) => {
      rows += 1;
      if (
        !output.write(encodeRow(columns.map((column) => valueForCsv(table, column, row[column]))))
      ) {
        request.pause();
        output.once('drain', () => request.resume());
      }
    });
    request.on('error', reject);
    request.on('done', () => {
      output.end();
      resolve();
    });
    void request.query(query).catch(reject);
  });
  await finished(destination);
  console.log(`${table}: ${rows.toLocaleString()} rows exported`);
  return rows;
}

async function collectQuery(
  pool: mssql.ConnectionPool,
  query: string,
): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  const request = pool.request();
  const result = await request.query(query);
  const columns = result.recordset.columns ? Object.keys(result.recordset.columns) : [];
  return { columns, rows: result.recordset as Record<string, unknown>[] };
}

// Write the indicator identity split (id, created_at) and
// one published indicator_version per indicator, composed from indicator + indicator_metadata rows.
async function writeIndicatorSplit(
  pool: mssql.ConnectionPool,
  outDirectory: string,
): Promise<void> {
  const indicatorQuery =
    `SELECT i.id,i.name,vt.name AS value_type_name,u.name AS unit_name,yt.name AS year_type_name,` +
    `i.ci_method_id,p.name AS polarity_name,f.name AS frequency_name,i.comparator_method_id,` +
    `i.ci_confidence_level,i.updated_at,i.created_at,i.created_by,i.updated_by ` +
    `FROM indicator i ` +
    `LEFT JOIN value_type vt ON vt.id = i.value_type_id ` +
    `LEFT JOIN unit u ON u.id = i.unit_id ` +
    `LEFT JOIN year_type yt ON yt.id = i.year_type_id ` +
    `LEFT JOIN polarity p ON p.id = i.polarity_id ` +
    `LEFT JOIN frequency f ON f.id = i.frequency_id ` +
    `WHERE i.id IN (${indicatorList})`;
  const metadataQuery = `SELECT indicator_id,definition,rationale,methodology,numerator_definition,denominator_definition,disclosure_control,caveats,notes,data_source_id,numerator_source_id,denominator_source_id FROM indicator_metadata WHERE indicator_id IN (${indicatorList})`;

  const [{ rows: indicatorRows }, { rows: metadataRows }] = await Promise.all([
    collectQuery(pool, indicatorQuery),
    collectQuery(pool, metadataQuery),
  ]);

  const metadataByIndicatorId = new Map(metadataRows.map((row) => [String(row.indicator_id), row]));

  const identityColumns = ['id', 'created_at'];
  const versionColumns = [
    'id',
    'indicator_id',
    'status',
    'is_locked',
    'published_at',
    'name',
    'value_type_id',
    'unit_id',
    'unit_detail',
    'period_type',
    'year_type',
    'year_end_day',
    'year_end_month',
    'ci_method_id',
    'polarity',
    'update_frequency',
    'comparator_method_id',
    'ci_confidence_level',
    'definition',
    'rationale',
    'methodology',
    'numerator_definition',
    'denominator_definition',
    'disclosure_control',
    'disclosure_control_detail',
    'has_rounding',
    'rounding_detail',
    'has_caveats',
    'caveats_detail',
    'has_other_notes',
    'other_notes_detail',
    'data_source_id',
    'numerator_source_id',
    'denominator_source_id',
    'created_at',
    'updated_at',
    'created_by',
    'updated_by',
  ];

  const identityOut = createGzip({ level: 1 });
  const versionOut = createGzip({ level: 1 });
  const identityDest = createWriteStream(join(outDirectory, 'indicator.csv.gz'));
  const versionDest = createWriteStream(join(outDirectory, 'indicator_version.csv.gz'));
  identityOut.pipe(identityDest);
  versionOut.pipe(versionDest);

  identityOut.write(encodeRow(identityColumns));
  versionOut.write(encodeRow(versionColumns));

  for (const row of indicatorRows) {
    const id = String(row.id ?? '');
    const meta = metadataByIndicatorId.get(id);

    identityOut.write(
      encodeRow(identityColumns.map((col) => valueForCsv('indicator', col, row[col]))),
    );

    const ncAnswers = notesAndCaveats({
      disclosureControl: meta?.disclosure_control != null ? String(meta.disclosure_control) : null,
      caveats: meta?.caveats != null ? String(meta.caveats) : null,
      notes: meta?.notes != null ? String(meta.notes) : null,
    });
    const vtName = row.value_type_name != null ? String(row.value_type_name) : null;
    const uName = row.unit_name != null ? String(row.unit_name) : null;
    const ytName = row.year_type_name != null ? String(row.year_type_name) : null;
    const translatedUnit = uName != null ? unitValues(uName) : { unit_id: null, unit_detail: null };
    const translatedYt = ytName != null ? yearTypeValues(ytName) : null;
    const versionRow: Record<string, unknown> = {
      id,
      indicator_id: id,
      status: 'published',
      is_locked: true,
      published_at: row.updated_at,
      name: row.name,
      value_type_id: vtName != null ? valueTypeId(vtName) : null,
      unit_id: translatedUnit.unit_id,
      unit_detail: translatedUnit.unit_detail,
      period_type: translatedYt?.period_type ?? null,
      year_type: translatedYt?.year_type ?? null,
      year_end_day: translatedYt?.year_end_day ?? null,
      year_end_month: translatedYt?.year_end_month ?? null,
      ci_method_id: row.ci_method_id,
      polarity: row.polarity_name != null ? translatePolarity(String(row.polarity_name)) : null,
      update_frequency:
        row.frequency_name != null ? translateFrequency(String(row.frequency_name)) : null,
      comparator_method_id: row.comparator_method_id,
      ci_confidence_level: row.ci_confidence_level,
      definition: meta?.definition ?? null,
      rationale: meta?.rationale ?? null,
      methodology: meta?.methodology ?? null,
      numerator_definition: meta?.numerator_definition ?? null,
      denominator_definition: meta?.denominator_definition ?? null,
      disclosure_control: ncAnswers.disclosure_control,
      disclosure_control_detail: ncAnswers.disclosure_control_detail,
      has_rounding: ncAnswers.has_rounding,
      rounding_detail: ncAnswers.rounding_detail,
      has_caveats: ncAnswers.has_caveats,
      caveats_detail: ncAnswers.caveats_detail,
      has_other_notes: ncAnswers.has_other_notes,
      other_notes_detail: ncAnswers.other_notes_detail,
      data_source_id: meta?.data_source_id ?? null,
      numerator_source_id: meta?.numerator_source_id ?? null,
      denominator_source_id: meta?.denominator_source_id ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
      updated_by: row.updated_by,
    };
    versionOut.write(
      encodeRow(
        versionColumns.map((col) => valueForCsv('indicator_version', col, versionRow[col])),
      ),
    );
  }

  identityOut.end();
  versionOut.end();
  await Promise.all([finished(identityDest), finished(versionDest)]);
  console.log(`indicator: ${indicatorRows.length.toLocaleString()} identity rows exported`);
  console.log(`indicator_version: ${indicatorRows.length.toLocaleString()} version rows exported`);
}

export async function exportLegacySeed(
  connectionString: string,
  outDirectory: string,
): Promise<void> {
  await ensureDirectory(outDirectory);
  const pool = await mssql.connect(connectionString);
  try {
    for (const [table, query] of streamingQueries)
      await streamQuery(pool, table, query, outDirectory);
    await writeIndicatorSplit(pool, outDirectory);
  } finally {
    await pool.close();
  }
  await rekeyDirectory(outDirectory, undefined);
}
