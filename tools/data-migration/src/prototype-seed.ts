import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';

import { schema } from '@fphd/db';
import { slugify } from '@fphd/utils/slug';
import { countIsNumerator } from '@fphd/utils/value-type-and-unit';
import { parse } from 'csv-parse';
import postgres, { type TransactionSql } from 'postgres';
import { ensureDirectory, writeGzipped } from './files.ts';
import { translateFrequency, translatePolarity } from './fingertips-lookups.ts';
import { legacySource, legacySourceIds, readLegacyMap } from './legacy-sources.ts';
import { notesAndCaveats } from './notes-and-caveats.ts';
import { countAndNumerator } from './pholio/observations.ts';
import { unitNameForLabel, unitValues, valueTypeId } from './pholio/value-type-and-unit.ts';
import { yearTypeValues } from './pholio/year-type.ts';

const indicatorConfig = {
  241: {
    polarity: 'Not applicable',
    comparator: 'Confidence intervals overlapping reference value (95.0 & 99.8)',
    confidence: 'both',
  },
  93861: { polarity: 'RAG - Low is good', comparator: 'No comparison', confidence: null },
  93995: {
    polarity: 'RAG - Low is good',
    comparator: 'Confidence intervals overlapping reference value (95.0 & 99.8)',
    confidence: 'both',
  },
} as const;
const indicatorIds = Object.keys(indicatorConfig).map(Number);
// The user the imported records are written by.
const TEST_SEED_USER_ID = schema.SYSTEM_USER_IDS.testSeed;
const validFrom: Record<number, string> = {
  173: '2020-04-01',
  174: '2021-04-01',
  175: '2023-04-01',
  221: '2022-07-01',
  223: '2022-07-01',
};
const imdType = 'LSOA21 deprivation deciles within area (IMD trend)';
const imdValues = [
  'Most deprived decile',
  'Second most deprived decile',
  'Third more deprived decile',
  'Fourth more deprived decile',
  'Fifth more deprived decile',
  'Fifth less deprived decile',
  'Fourth less deprived decile',
  'Third less deprived decile',
  'Second least deprived decile',
  'Least deprived decile',
];
const exportTables = [
  'dimension_type',
  'dimension_value',
  'area',
  'indicator',
  'indicator_version',
  'upload_batch',
  'observation',
  'observation_dimension',
  'observation_note',
] as const;

interface AreaRecord {
  code: string;
  name: string;
  sourceTypeId: number;
  areaType: string;
}
interface IndicatorMetadataInput {
  Descriptive: Record<string, string | undefined>;
  Unit: { Label: string };
  ValueType: { Name: string };
  YearType: { Name: string };
  ConfidenceIntervalMethod: { Name: string };
  DataChange: { LastUploadedAt: string };
}
type Metadata = Record<string, IndicatorMetadataInput>;

function uuid7(): string {
  const timestamp = BigInt(Date.now());
  const random = BigInt(`0x${randomBytes(10).toString('hex')}`);
  const value =
    (timestamp << 80n) |
    (0x7n << 76n) |
    ((random & 0xfffn) << 64n) |
    (0x2n << 62n) |
    (random & ((1n << 62n) - 1n));
  const hex = value.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parsePeriod(period: string): [string, string] {
  if (period.includes('/')) {
    const start = Number(period.slice(0, 4));
    return [`${start}-04-01`, `${start + 1}-03-31`];
  }
  if (period.includes(' - ')) {
    const [startText = '', endText = ''] = period.split(' - ', 2);
    const start = Number(startText);
    const end =
      endText.length === 4 ? Number(endText) : Math.floor(start / 100) * 100 + Number(endText);
    return [`${start}-01-01`, `${end}-12-31`];
  }
  return [`${period}-01-01`, `${period}-12-31`];
}

function number(value: string): number | null {
  return value === '' ? null : Number(value);
}

async function namedId(
  tx: TransactionSql,
  table: string,
  name: string | undefined,
): Promise<string | null> {
  if (!name) return null;
  const rows = await tx.unsafe<{ id: string }[]>(`SELECT id FROM "${table}" WHERE name = $1`, [
    name,
  ]);
  if (!rows[0]) throw new Error(`Missing ${table} row: ${name}`);
  return rows[0].id;
}

async function addImdDimension(tx: TransactionSql): Promise<void> {
  let [type] = await tx<{ id: string }[]>`SELECT id FROM dimension_type WHERE name = ${imdType}`;
  if (!type) {
    [type] = await tx<{ id: string }[]>`
      INSERT INTO dimension_type
        (id, name, dimension_class, classification_scheme, granularity, scheme_version, is_required)
      VALUES (${uuid7()}, ${imdType}, 'inequality', 'English indices of deprivation', 'decile', 'IMD trend', false)
      RETURNING id
    `;
  }
  if (!type) throw new Error('Could not create deprivation dimension');
  const existing = new Set(
    (
      await tx<
        { name: string }[]
      >`SELECT name FROM dimension_value WHERE dimension_type_id = ${type.id}`
    ).map(({ name }) => name),
  );
  const rows = imdValues.flatMap((name, index) =>
    existing.has(name)
      ? []
      : [
          {
            id: uuid7(),
            dimension_type_id: type.id,
            name,
            code: String(index + 1),
            sort_order: index + 1,
            is_aggregate: false,
          },
        ],
  );
  if (rows.length > 0) await tx`INSERT INTO dimension_value ${tx(rows)}`;
}

async function loadAreas(
  areaDirectory: string,
  areaTypesPath: string,
): Promise<Map<string, AreaRecord>> {
  const types = JSON.parse(await readFile(areaTypesPath, 'utf8')) as {
    Id: number;
    Short: string;
  }[];
  const names = new Map(types.map(({ Id, Short }) => [Id, Short]));
  const areas = new Map<string, AreaRecord>();
  for (const typeId of [6, 7, 221, 223, 501, 502]) {
    const rows = JSON.parse(
      await readFile(join(areaDirectory, `fphd-areas-${typeId}.json`), 'utf8'),
    ) as { Code: string; Name: string; AreaTypeId: number }[];
    for (const row of rows) {
      const areaType = names.get(Number(row.AreaTypeId));
      if (!areaType) throw new Error(`Missing area type ${row.AreaTypeId}`);
      areas.set(row.Code, {
        code: row.Code,
        name: row.Name,
        sourceTypeId: Number(row.AreaTypeId),
        areaType,
      });
    }
  }
  const englandType = names.get(15);
  if (!englandType) throw new Error('Missing England area type');
  areas.set('E92000001', {
    code: 'E92000001',
    name: 'England',
    sourceTypeId: 15,
    areaType: englandType,
  });
  return areas;
}

async function addAreas(
  tx: TransactionSql,
  registry: Map<string, AreaRecord>,
): Promise<Map<string, string>> {
  const ids = new Map(
    (
      await tx<{ id: string; code: string }[]>`SELECT id, code FROM area WHERE is_current = true`
    ).map(({ id, code }) => [code, id]),
  );
  const types = new Map(
    (await tx<{ id: string; name: string }[]>`SELECT id, name FROM area_type`).map(
      ({ id, name }) => [name, id],
    ),
  );
  const rows: Record<string, unknown>[] = [];
  for (const area of registry.values()) {
    if (ids.has(area.code)) continue;
    const areaTypeId = types.get(area.areaType);
    if (!areaTypeId) throw new Error(`Missing area type row: ${area.areaType}`);
    const id = uuid7();
    ids.set(area.code, id);
    rows.push({
      id,
      code: area.code,
      name: area.name,
      area_type_id: areaTypeId,
      valid_from: validFrom[area.sourceTypeId] ?? '2000-01-01',
    });
  }
  if (rows.length > 0) await tx`INSERT INTO area ${tx(rows)}`;
  return ids;
}

async function addIndicators(
  tx: TransactionSql,
  metadata: Metadata,
  seedDirectory: string,
): Promise<{ indicators: Map<string, string>; batches: Map<string, string> }> {
  const existing = await tx<
    { shortId: number }[]
  >`SELECT short_id AS "shortId" FROM indicator WHERE short_id IN ${tx(indicatorIds)}`;
  if (existing.length > 0)
    throw new Error(
      `Prototype indicators already exist: ${existing.map(({ shortId }) => shortId).join(', ')}`,
    );

  const sourceIds = await legacySourceIds(seedDirectory);
  const legacyMap = await readLegacyMap();
  const providerRows = await tx<
    { id: string; name: string; sourceId: string | null; sourceName: string | null }[]
  >`
    SELECT p.id, p.name, s.id AS "sourceId", s.name AS "sourceName"
    FROM data_provider p
    LEFT JOIN data_provider_source s ON s.provider_id = p.id
  `;
  const providerIds = new Map<string, { providerId: string; sourceId: string | null }>();
  for (const row of providerRows) {
    providerIds.set(JSON.stringify([row.name, null]), { providerId: row.id, sourceId: null });
    if (row.sourceId !== null)
      providerIds.set(JSON.stringify([row.name, row.sourceName]), {
        providerId: row.id,
        sourceId: row.sourceId,
      });
  }

  const indicators = new Map<string, string>();
  const batches = new Map<string, string>();
  for (const shortId of indicatorIds) {
    const item = metadata[String(shortId)];
    if (!item) throw new Error(`Missing metadata for ${shortId}`);
    const descriptive = item.Descriptive;
    const config = indicatorConfig[shortId as keyof typeof indicatorConfig];
    const name = descriptive.Name;
    if (!name) throw new Error(`Missing indicator name for ${shortId}`);
    const id = uuid7();
    const batchId = uuid7();
    const versionId = uuid7();
    const updatedAt = String(item.DataChange.LastUploadedAt);
    indicators.set(String(shortId), id);
    batches.set(String(shortId), batchId);
    await tx`
      INSERT INTO indicator (id, short_id, created_at)
      VALUES (${id}, ${shortId}, ${updatedAt})
    `;
    const nc = notesAndCaveats({
      disclosureControl: descriptive.DiscControl ?? null,
      caveats: descriptive.Caveats ?? null,
      notes: descriptive.Notes ?? null,
    });
    const unit = unitValues(unitNameForLabel(item.Unit.Label));
    const yt = yearTypeValues(item.YearType.Name);
    await tx`
      INSERT INTO indicator_version
        (id, indicator_id, status, published_at, name, slug,
         value_type_id, unit_id, unit_detail, period_type, year_type, year_end_day, year_end_month,
         ci_method_id, polarity,
         update_frequency, comparator_method_id, ci_confidence_level,
         definition, rationale, methodology, numerator_definition,
         denominator_definition,
         disclosure_control, disclosure_control_detail,
         has_rounding, rounding_detail,
         has_caveats, caveats_detail,
         has_other_notes, other_notes_detail,
         data_source_id,
         created_at, created_by, updated_at, updated_by)
      VALUES (${versionId}, ${id}, 'published', ${updatedAt}, ${name}, ${slugify(name)},
        ${valueTypeId(item.ValueType.Name)},
        ${unit.unit_id}, ${unit.unit_detail},
        ${yt.period_type}, ${yt.year_type}, ${yt.year_end_day}, ${yt.year_end_month},
        ${await namedId(tx, 'ci_method', item.ConfidenceIntervalMethod.Name)},
        ${translatePolarity(config.polarity)},
        ${translateFrequency('Annual')},
        ${await namedId(tx, 'comparator_method', config.comparator)}, ${config.confidence},
        ${descriptive.Definition ?? null}, ${descriptive.Rationale ?? null},
        ${descriptive.IndMethod ?? null}, ${descriptive.CountDefinition ?? null},
        ${descriptive.DenomDefinition ?? null},
        ${nc.disclosure_control}, ${nc.disclosure_control_detail},
        ${nc.has_rounding}, ${nc.rounding_detail},
        ${nc.has_caveats}, ${nc.caveats_detail},
        ${nc.has_other_notes}, ${nc.other_notes_detail},
        ${await namedId(tx, 'data_source', descriptive.DataSource)},
        ${updatedAt}, ${TEST_SEED_USER_ID}, ${updatedAt}, ${TEST_SEED_USER_ID})
    `;

    for (const [part, sourceName] of [
      ['numerator', descriptive.CountSource],
      ['denominator', descriptive.DenomSource],
    ] as const) {
      const [, pairs] = legacySource(sourceName ?? null, sourceIds, legacyMap);
      const typedPairs = pairs as { provider: string; source: string | null }[];
      const rows = typedPairs.map((pair, position) => {
        const key = JSON.stringify([pair.provider, pair.source ?? null]);
        const ids = providerIds.get(key);
        if (!ids)
          throw new Error(
            `No data_provider row for source "${pair.provider}" / "${pair.source ?? null}"`,
          );
        return {
          indicator_version_id: versionId,
          part,
          position,
          provider_id: ids.providerId,
          source_id: ids.sourceId,
        };
      });
      if (rows.length > 0) await tx`INSERT INTO indicator_version_source ${tx(rows)}`;
    }

    await tx`
      INSERT INTO upload_batch
        (id, indicator_id, original_filename, uploaded_by, uploaded_at, status, validation_result)
      VALUES (${batchId}, ${id}, ${`fingertips-${shortId}.csv`}, ${TEST_SEED_USER_ID},
        ${updatedAt}, 'processed', ${tx.json({ source: 'Public Fingertips API', validated: true })})
    `;
  }
  return { indicators, batches };
}

async function addObservations(
  tx: TransactionSql,
  dataPath: string,
  registry: Map<string, AreaRecord>,
  areas: Map<string, string>,
  metadata: Metadata,
  indicators: Map<string, string>,
  batches: Map<string, string>,
): Promise<void> {
  const dimensions = new Map(
    (
      await tx<{ key: string; valueId: string; typeId: string; aggregate: boolean }[]>`
    SELECT dt.name || E'\000' || dv.name AS key, dv.id AS "valueId", dt.id AS "typeId", dv.is_aggregate AS aggregate
    FROM dimension_value dv JOIN dimension_type dt ON dt.id = dv.dimension_type_id
  `
    ).map((row) => [row.key, row]),
  );
  const notes = new Map(
    (await tx<{ id: string; text: string }[]>`SELECT id, text FROM note_type`).map(
      ({ id, text }) => [text, id],
    ),
  );
  const observations: Record<string, unknown>[] = [];
  const observationDimensions: Record<string, unknown>[] = [];
  const observationNotes: Record<string, unknown>[] = [];
  const parser = createReadStream(dataPath).pipe(parse({ columns: true, bom: true }));
  for await (const raw of parser) {
    const row = raw as Record<string, string>;
    const shortId = row['Indicator ID'] ?? '';
    const areaCode = row['Area Code'] ?? '';
    if (!indicatorIds.includes(Number(shortId)) || !registry.has(areaCode)) continue;
    const id = uuid7();
    const [fromDate, toDate] = parsePeriod(row['Time period'] ?? '');
    const publishedAt = String(metadata[shortId]?.DataChange.LastUploadedAt);
    const valueType = metadata[shortId]?.ValueType.Name;
    const measures = countAndNumerator(
      number(row.Count ?? ''),
      valueType !== undefined && countIsNumerator(valueTypeId(valueType), Number(shortId)),
    );
    observations.push({
      id,
      indicator_id: indicators.get(shortId),
      area_id: areas.get(areaCode),
      from_date: fromDate,
      to_date: toDate,
      value: number(row.Value ?? ''),
      ...measures,
      denominator: number(row.Denominator ?? ''),
      lower_ci_95: number(row['Lower CI 95.0 limit'] ?? ''),
      upper_ci_95: number(row['Upper CI 95.0 limit'] ?? ''),
      lower_ci_998: number(row['Lower CI 99.8 limit'] ?? ''),
      upper_ci_998: number(row['Upper CI 99.8 limit'] ?? ''),
      published_at: publishedAt,
      upload_batch_id: batches.get(shortId),
      created_at: publishedAt,
    });
    const names: Record<string, string> = {};
    if (row.Sex && row.Sex !== 'Persons') names.Sex = row.Sex;
    if (row.Age) names.Age = row.Age;
    if (row['Category Type'] && row.Category) names[row['Category Type'].trim()] = row.Category;
    for (const [type, value] of Object.entries(names)) {
      const dimension = dimensions.get(`${type}\u0000${value}`);
      if (!dimension) throw new Error(`Missing dimension value: ${type}/${value}`);
      if (!dimension.aggregate)
        observationDimensions.push({
          id: uuid7(),
          observation_id: id,
          dimension_value_id: dimension.valueId,
          dimension_type_id: dimension.typeId,
        });
    }
    const note = row['Value note'];
    if (note) {
      const noteId = notes.get(note);
      if (!noteId) throw new Error(`Missing note type: ${note}`);
      observationNotes.push({ id: uuid7(), observation_id: id, note_type_id: noteId });
    }
    if (observations.length >= 5_000) {
      await tx`INSERT INTO observation ${tx(observations.splice(0))}`;
      if (observationDimensions.length > 0)
        await tx`INSERT INTO observation_dimension ${tx(observationDimensions.splice(0))}`;
      if (observationNotes.length > 0)
        await tx`INSERT INTO observation_note ${tx(observationNotes.splice(0))}`;
    }
  }
  if (observations.length > 0) await tx`INSERT INTO observation ${tx(observations)}`;
  if (observationDimensions.length > 0)
    await tx`INSERT INTO observation_dimension ${tx(observationDimensions)}`;
  if (observationNotes.length > 0) await tx`INSERT INTO observation_note ${tx(observationNotes)}`;
}

async function exportChangedTables(
  sql: postgres.Sql,
  seedDirectory: string,
  outDirectory: string,
): Promise<void> {
  await ensureDirectory(outDirectory);
  for (const table of exportTables) {
    const headerStream = createReadStream(join(seedDirectory, `${table}.csv.gz`)).pipe(
      createGunzip(),
    );
    let header = '';
    for await (const chunk of headerStream) {
      header += chunk.toString();
      if (header.includes('\n')) break;
    }
    headerStream.destroy();
    const columns = header
      .slice(0, header.indexOf('\n'))
      .trim()
      .split(',')
      .map((column) => column.replaceAll('"', ''))
      // The table has no created_by for observations: the batch's uploader is the writer.
      .filter((column) => table !== 'observation' || column !== 'created_by');
    const quoted = columns.map((column) => `"${column}"`).join(', ');
    await writeGzipped(
      await sql
        .unsafe(`COPY (SELECT ${quoted} FROM "${table}" ORDER BY id) TO STDOUT WITH CSV HEADER`)
        .readable(),
      join(outDirectory, `${table}.csv.gz`),
    );
  }
}

export interface PrototypeSeedOptions {
  databaseUrl: string;
  dataCsv: string;
  metadataJson: string;
  areaTypesJson: string;
  areaDirectory: string;
  seedDirectory: string;
  outDirectory: string;
}

export async function importPrototypeSeed(options: PrototypeSeedOptions): Promise<void> {
  const host = new URL(options.databaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host))
    throw new Error(`Refusing non-local database host ${host}`);
  const metadata = JSON.parse(await readFile(options.metadataJson, 'utf8')) as Metadata;
  const registry = await loadAreas(options.areaDirectory, options.areaTypesJson);
  const sql = postgres(options.databaseUrl, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      await addImdDimension(tx);
      const areas = await addAreas(tx, registry);
      const added = await addIndicators(tx, metadata, options.seedDirectory);
      await addObservations(
        tx,
        options.dataCsv,
        registry,
        areas,
        metadata,
        added.indicators,
        added.batches,
      );
      const coverage = await tx<
        { shortId: number; observations: number; areas: number; types: number }[]
      >`
        SELECT i.short_id AS "shortId", count(o.id)::int AS observations,
          count(DISTINCT a.code)::int AS areas, count(DISTINCT at.name)::int AS types
        FROM indicator i JOIN observation o ON o.indicator_id = i.id
        JOIN area a ON a.id = o.area_id JOIN area_type at ON at.id = a.area_type_id
        WHERE i.short_id IN ${tx(indicatorIds)} GROUP BY i.short_id ORDER BY i.short_id
      `;
      if (
        coverage.length !== indicatorIds.length ||
        coverage.some((row) => row.observations === 0 || row.areas <= 1 || row.types <= 1)
      ) {
        throw new Error(`Prototype indicator coverage is too narrow: ${JSON.stringify(coverage)}`);
      }
    });
    await exportChangedTables(sql, options.seedDirectory, options.outDirectory);
  } finally {
    await sql.end();
  }
}
