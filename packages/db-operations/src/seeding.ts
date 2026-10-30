import { createReadStream, readFileSync } from 'node:fs';
import type { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

import { DEV_CLASS_APP_ENVS, isDevClassEnv } from '@fphd/config';
import { createDbFromTransaction, schema } from '@fphd/db';
import type postgres from 'postgres';

import { type IndicatorTopicFile, parseIndicatorTopicFile } from './indicator-topic-file.ts';
import {
  applyIndicatorTopics,
  type IndicatorTopicImportSummary,
} from './indicator-topic-import.ts';
import { type LegacySourceMap, mapLegacySources, readLegacySourceMap } from './legacy-sources.ts';
import { READ_MODEL_TABLES } from './read-models.ts';
import { SEED_TABLES } from './seed-tables.ts';

export { SEED_TABLES } from './seed-tables.ts';

const { IMPORTED_INDICATOR_TEAM_ID } = schema;

// Staged from the files but never loaded: the service keeps no table of that name.
const STAGED_ONLY_TABLES: readonly string[] = ['numerator_denominator_source'];

// Staged from the files, whose versions are pointed at the core data rows of the same name.
const CORE_DATA_TABLES: readonly string[] = ['ci_method', 'comparator_method'];

/** Every table a seed writes, in load order, for a caller that analyzes them afterwards. */
export const SEEDED_TABLES = [
  ...SEED_TABLES.filter((table) => !STAGED_ONLY_TABLES.includes(table)),
  'indicator_version_source',
];

const seedDir = fileURLToPath(new URL('../data/seed/', import.meta.url));
const COPY_IDLE_TIMEOUT_MS = 300_000;
// Matches the deployed beta operations job's outer execution limit.
const PUBLISHED_COPY_TIMEOUT_MS = 6 * 60 * 60 * 1_000;

/** The COPY takes its column list from the file, so callers can check one before importing. */
export async function readCsvHeader(file: string): Promise<string[]> {
  const stream = createReadStream(file).pipe(createGunzip());
  let text = '';
  for await (const chunk of stream) {
    text += chunk.toString('utf8');
    const newline = text.indexOf('\n');
    if (newline !== -1) {
      stream.destroy();
      return text
        .slice(0, newline)
        .trim()
        .split(',')
        .map((column) => column.replace(/^"|"$/g, '').replaceAll('""', '"'));
    }
  }
  throw new Error(`No header row in ${file}`);
}

/** Loads a table's CSV into that table, or into `into`, such as a staging table. */
async function loadTable(
  sql: postgres.Sql | postgres.TransactionSql,
  table: string,
  directory: string,
  idleTimeoutMs = COPY_IDLE_TIMEOUT_MS,
  completionTimeoutMs = idleTimeoutMs,
  into = table,
): Promise<number> {
  const file = `${directory}/${table}.csv.gz`;
  const columns = await readCsvHeader(file);
  // A file exported before a migration renamed or dropped a column would otherwise fail on COPY.
  const known = await sql<{ name: string }[]>`
    SELECT attname AS name FROM pg_attribute
    WHERE attrelid = ${`"${into}"`}::regclass AND attnum > 0 AND NOT attisdropped
  `;
  const unknown = columns.filter((column) => !known.some(({ name }) => name === column));
  if (unknown.length > 0) {
    throw new Error(
      `${table}.csv.gz has columns ${table} does not: ${unknown.join(', ')}. Export it again against the current schema`,
    );
  }
  const columnList = columns.map((c) => `"${c}"`).join(', ');
  const writable = await sql
    .unsafe(`COPY "${into}" (${columnList}) FROM STDIN WITH (FORMAT csv, HEADER true)`)
    .writable();

  await streamSeedCsv(file, writable, table, idleTimeoutMs, completionTimeoutMs);
  const rows = await sql.unsafe(`SELECT count(*)::int AS count FROM "${into}"`);
  const count = Number(rows[0]?.count ?? 0);
  if (count === 0) {
    throw new Error(`COPY into "${table}" loaded no rows — check the seed CSV`);
  }
  return count;
}

/** Abort a COPY that stops making progress, including before its input reaches EOF. */
export async function streamSeedCsv(
  file: string,
  writable: Writable,
  table: string,
  idleTimeoutMs = COPY_IDLE_TIMEOUT_MS,
  completionTimeoutMs = idleTimeoutMs,
): Promise<void> {
  const decompressed = createGunzip();
  const abort = new AbortController();
  // postgres.js can leave finish unemitted if Postgres rejects COPY after the
  // stream ends. Refreshing on decompressed chunks also catches mid-stream stalls.
  let timeout: NodeJS.Timeout | undefined;
  const stopWaiting = () => clearTimeout(timeout);
  const stalled = new Promise<'stalled'>((resolve) => {
    const markStalled = () => resolve('stalled');
    timeout = setTimeout(markStalled, idleTimeoutMs).unref();
    decompressed.once('end', () => {
      stopWaiting();
      timeout = setTimeout(markStalled, completionTimeoutMs).unref();
    });
  });
  const onProgress = () => timeout?.refresh();
  decompressed.on('data', onProgress);
  const streamed = pipeline(createReadStream(file), decompressed, writable, {
    end: true,
    signal: abort.signal,
  });
  try {
    if ((await Promise.race([streamed.then(() => 'finished' as const), stalled])) === 'stalled') {
      abort.abort();
      await streamed.catch(() => undefined);
      throw new Error(`COPY into "${table}" stopped making progress`);
    }
  } finally {
    stopWaiting();
    decompressed.off('data', onProgress);
  }
}

/** Fails closed: an explicit APP_ENV is required rather than a missing value being assumed safe. */
function assertDevClassEnv(action: string, appEnv: string | undefined): void {
  if (isDevClassEnv(appEnv)) return;

  throw new Error(
    `Refusing to ${action}: APP_ENV is ${appEnv === undefined ? 'unset' : `'${appEnv}'`}; ` +
      `set it to one of ${DEV_CLASS_APP_ENVS.map((value) => `'${value}'`).join(', ')} explicitly`,
  );
}

/** The seed erases and replaces every dummy table. */
export function assertSeedingAllowed(appEnv: string | undefined, action = 'seed dummy data'): void {
  assertDevClassEnv(action, appEnv);
}

/** A reset erases the whole application schema. Same gate as seeding, deliberately. */
export function assertResetAllowed(appEnv: string | undefined): void {
  assertDevClassEnv('reset', appEnv);
}

// The three files are separate concerns but a single import: they all key off the same
// indicators, so importing one without the others would leave the site half-populated.
const dummyRelationshipFiles = [
  '../data/indicator-topics.json',
  '../data/indicator-classifications.json',
  '../data/indicator-data-updated.json',
].map((path) => fileURLToPath(new URL(path, import.meta.url)));
const publishedTopicFile = fileURLToPath(
  new URL('../data/published-indicator-topics.json', import.meta.url),
);

function readDummyRelationships(): IndicatorTopicFile {
  const merged: Record<string, unknown> = {};
  for (const file of dummyRelationshipFiles) {
    Object.assign(merged, JSON.parse(readFileSync(file, 'utf-8')));
  }
  return parseIndicatorTopicFile(merged);
}

export interface SeedSummary {
  /** Rows loaded per seed table, in load order. */
  tables: Record<string, number>;
  relationships: IndicatorTopicImportSummary;
}

/**
 * Erase and reload every dummy table from the committed seed, inside the caller's
 * transaction: the CSV-backed canonical tables first, then the JSON-backed indicator
 * relationships, which reference the freshly loaded indicators and the topics the core
 * import owns. The core-data tables (topics) are never wiped — the TRUNCATE cascades only
 * into tables that reference the dummy ones, such as the indicator-topic links themselves.
 * Callers own the safety decision — the seed-dummy-data command calls
 * assertSeedingAllowed, and the integration harness only ever targets its own disposable
 * databases.
 */
export async function seedDummyTables(
  tx: postgres.TransactionSql,
  directory = seedDir,
): Promise<SeedSummary> {
  // Read before any database work, so a bad file fails while the transaction has done nothing.
  const relationshipFile = readDummyRelationships();
  const tables = await seedTables(tx, directory);
  const relationships = await applyIndicatorTopics(createDbFromTransaction(tx), relationshipFile);
  // Freshly loaded tables have no statistics, and the planner's guesses are wrong by enough
  // to turn an indexed observation lookup into a sequential scan over the whole table.
  await tx.unsafe(`ANALYZE ${analyzableTables()}`);
  return { tables, relationships };
}

/** Loads the snapshot CSVs and the workbook's explicit taxonomy assignments. */
export async function seedPublishedTables(
  tx: postgres.TransactionSql,
  directory: string,
): Promise<SeedSummary> {
  const topicFile = parseIndicatorTopicFile(JSON.parse(readFileSync(publishedTopicFile, 'utf-8')));
  const tables = await seedTables(
    tx,
    directory,
    PUBLISHED_COPY_TIMEOUT_MS,
    PUBLISHED_COPY_TIMEOUT_MS,
  );
  const relationships = await applyIndicatorTopics(createDbFromTransaction(tx), topicFile);
  assertPublishedRelationships(relationships);
  return { tables, relationships };
}

export function assertPublishedRelationships(relationships: IndicatorTopicImportSummary): void {
  if (
    relationships.links === 0 ||
    relationships.unknownIndicators.length > 0 ||
    relationships.unknownTopics.length > 0 ||
    relationships.unknownSubtopics.length > 0 ||
    relationships.unknownClassifications.length > 0
  ) {
    const missing = relationships.unknownIndicators.length
      ? `; missing indicator IDs: ${relationships.unknownIndicators.join(', ')}`
      : '';
    throw new Error(
      `Published topic mapping did not match the imported indicators and topics${missing}`,
    );
  }
}

function analyzableTables(): string {
  return [
    ...SEEDED_TABLES,
    'indicator_version_topic',
    'indicator_version_subtopic',
    'indicator_version_classification',
  ]
    .map((table) => `"${table}"`)
    .join(', ');
}

async function seedTables(
  tx: postgres.TransactionSql,
  directory: string,
  idleTimeoutMs = COPY_IDLE_TIMEOUT_MS,
  completionTimeoutMs = idleTimeoutMs,
): Promise<Record<string, number>> {
  const replaced = [
    ...SEEDED_TABLES.filter((t) => !CORE_DATA_TABLES.includes(t)),
    ...READ_MODEL_TABLES,
  ];
  await tx.unsafe(`TRUNCATE ${replaced.map((t) => `"${t}"`).join(', ')} CASCADE`);

  const counts: Record<string, number> = {};
  for (const table of SEED_TABLES) {
    if (CORE_DATA_TABLES.includes(table) || STAGED_ONLY_TABLES.includes(table)) continue;

    if (table === 'indicator_version') {
      const loaded = await loadIndicatorVersions(tx, directory, idleTimeoutMs, completionTimeoutMs);
      counts.ci_method = loaded.ciMethods;
      counts.comparator_method = loaded.comparatorMethods;
      counts.indicator_version = loaded.versions;
      counts.numerator_denominator_source = loaded.legacySources;
      counts.indicator_version_source = loaded.sources;
    } else if (table === 'upload_batch') {
      counts.upload_batch = await loadUploadBatches(
        tx,
        directory,
        idleTimeoutMs,
        completionTimeoutMs,
      );
    } else if (table === 'observation') {
      const loaded = await loadObservations(tx, directory, idleTimeoutMs, completionTimeoutMs);
      counts.observation = loaded.observations;
      counts.observation_dimension = loaded.dimensions;
    } else if (table !== 'observation_dimension') {
      counts[table] = await loadTable(tx, table, directory, idleTimeoutMs, completionTimeoutMs);
    }
  }
  await tx`UPDATE indicator SET team_id = ${IMPORTED_INDICATOR_TEAM_ID} WHERE team_id IS NULL`;
  await pointVersionsAtBatches(tx);
  return counts;
}

/**
 * Loads the batches through a staging table, crediting each to a version: the files predate
 * versions, so each batch goes to its indicator's current published version, or to its draft
 * when nothing is published.
 */
async function loadUploadBatches(
  tx: postgres.TransactionSql,
  directory: string,
  idleTimeoutMs: number,
  completionTimeoutMs: number,
): Promise<number> {
  await tx`CREATE TEMP TABLE source_upload_batch (LIKE upload_batch INCLUDING DEFAULTS) ON COMMIT DROP`;
  await tx`ALTER TABLE source_upload_batch ALTER COLUMN indicator_version_id DROP NOT NULL`;
  await loadTable(
    tx,
    'upload_batch',
    directory,
    idleTimeoutMs,
    completionTimeoutMs,
    'source_upload_batch',
  );
  await tx`
    UPDATE source_upload_batch b
    SET indicator_version_id = coalesce(
      (SELECT cpv.id FROM current_published_version cpv WHERE cpv.indicator_id = b.indicator_id),
      (SELECT v.id FROM indicator_version v WHERE v.indicator_id = b.indicator_id AND v.status = 'draft')
    )
    WHERE indicator_version_id IS NULL
  `;
  const inserted = await tx`INSERT INTO upload_batch SELECT * FROM source_upload_batch`;
  return inserted.count;
}

/**
 * Loads the observations and their dimension values through staging tables, so each
 * observation is inserted with the dimension_key its dimension values make, as `dimensionKey`
 * builds it; the files predate the column.
 */
async function loadObservations(
  tx: postgres.TransactionSql,
  directory: string,
  idleTimeoutMs: number,
  completionTimeoutMs: number,
): Promise<{ observations: number; dimensions: number }> {
  await tx`CREATE TEMP TABLE source_observation (LIKE observation INCLUDING DEFAULTS) ON COMMIT DROP`;
  await tx`ALTER TABLE source_observation ALTER COLUMN dimension_key DROP NOT NULL`;
  // The files give each observation a writer, which its batch's uploader stands for; it is dropped.
  await tx`ALTER TABLE source_observation ADD COLUMN created_by text`;
  await tx`CREATE TEMP TABLE source_observation_dimension (LIKE observation_dimension INCLUDING DEFAULTS) ON COMMIT DROP`;
  await loadTable(
    tx,
    'observation',
    directory,
    idleTimeoutMs,
    completionTimeoutMs,
    'source_observation',
  );
  await loadTable(
    tx,
    'observation_dimension',
    directory,
    idleTimeoutMs,
    completionTimeoutMs,
    'source_observation_dimension',
  );

  const columns = await tx<{ name: string }[]>`
    SELECT attname AS name FROM pg_attribute
    WHERE attrelid = 'observation'::regclass AND attnum > 0 AND NOT attisdropped
    ORDER BY attnum
  `;
  const columnList = columns.map(({ name }) => `"${name}"`).join(', ');
  const selectList = columns
    .map(({ name }) =>
      name === 'dimension_key' ? `coalesce(o.dimension_key, k.dimension_key, '')` : `o."${name}"`,
    )
    .join(', ');
  const observations = await tx.unsafe(`
    INSERT INTO observation (${columnList})
    SELECT ${selectList}
    FROM source_observation o
    LEFT JOIN (
      SELECT observation_id,
             string_agg(dimension_value_id::text, ',' ORDER BY dimension_value_id) AS dimension_key
      FROM source_observation_dimension
      GROUP BY observation_id
    ) k ON k.observation_id = o.id
  `);
  const dimensions =
    await tx`INSERT INTO observation_dimension SELECT * FROM source_observation_dimension`;
  return { observations: observations.count, dimensions: dimensions.count };
}

/**
 * Restores explicit batch pointers after loading batches; legacy files without pointers use
 * the latest processed batch. Stops where the pointers would hide a published observation.
 */
async function pointVersionsAtBatches(tx: postgres.TransactionSql): Promise<void> {
  await tx`
    UPDATE indicator_version v
    SET upload_batch_id = s.upload_batch_id,
        data_table_confirmed_at = s.data_table_confirmed_at
    FROM source_indicator_version s
    WHERE s.id = v.id
      AND (s.upload_batch_id IS NOT NULL OR s.data_table_confirmed_at IS NOT NULL)
  `;
  await tx`
    UPDATE indicator_version v
    SET upload_batch_id = b.id, data_table_confirmed_at = b.uploaded_at
    FROM (
      SELECT DISTINCT ON (indicator_id) id, indicator_id, uploaded_at
      FROM upload_batch
      WHERE status = 'processed'
      ORDER BY indicator_id, uploaded_at DESC, id DESC
    ) b
    WHERE b.indicator_id = v.indicator_id AND v.upload_batch_id IS NULL
  `;
  const [hidden] = await tx<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM observation o
    JOIN current_published_version cpv ON cpv.indicator_id = o.indicator_id
    JOIN indicator_version v ON v.id = cpv.id
    WHERE o.deleted_at IS NULL AND o.upload_batch_id IS DISTINCT FROM v.upload_batch_id
  `;
  if (hidden?.count) {
    throw new Error(
      `${hidden.count} seeded observations lie outside the batch their published version points at`,
    );
  }
}

/** Pholio's names for the CI methods the service names differently; the rest match as they are. */
const PHOLIO_CI_METHOD_NAMES: Record<string, string> = {
  'Normal approximation': 'Wald normal approximation',
  'Other method - see below': 'Other method',
};

/** The Fingertips columns naming a version's single numerator and denominator source. */
const LEGACY_SOURCE_COLUMNS = ['numerator_source_id', 'denominator_source_id'];

/** A list the source carries its own rows of, whose versions point at the core rows instead. */
interface CoreDataLookup {
  table: 'ci_method' | 'comparator_method';
  column: 'ci_method_id' | 'comparator_method_id';
  /** The columns the source's file carries. */
  columns: string;
  label: string;
  file: string;
  /** The source's names for rows the service names differently. */
  renames: Record<string, string>;
}

const CI_METHOD_LOOKUP: CoreDataLookup = {
  table: 'ci_method',
  column: 'ci_method_id',
  columns: 'id uuid, name text, description text',
  label: 'CI method',
  file: 'data/ci-methods.json',
  renames: PHOLIO_CI_METHOD_NAMES,
};

const COMPARATOR_METHOD_LOOKUP: CoreDataLookup = {
  table: 'comparator_method',
  column: 'comparator_method_id',
  columns: 'id uuid, name text',
  label: 'comparator method',
  file: 'data/comparator-methods.json',
  renames: {},
};

const CORE_DATA_LOOKUPS = [CI_METHOD_LOOKUP, COMPARATOR_METHOD_LOOKUP];

export interface LoadedIndicatorVersions {
  ciMethods: number;
  comparatorMethods: number;
  versions: number;
  /** Rows of the source's own numerator and denominator source list. */
  legacySources: number;
  /** The providers and sources the versions were given in their place. */
  sources: number;
}

/**
 * Stages the source's rows of a core data list and maps each one its staged versions name onto
 * the core row of the same name, in `source_<table>_map`, and answers how many rows the file
 * held. A row with no core counterpart stops the load rather than being dropped.
 */
async function mapToCoreData(
  tx: postgres.TransactionSql,
  { table, column, columns, label, file, renames }: CoreDataLookup,
  directory: string,
  idleTimeoutMs: number,
  completionTimeoutMs: number,
): Promise<number> {
  await tx.unsafe(`CREATE TEMP TABLE source_${table} (${columns}) ON COMMIT DROP`);
  const loaded = await loadTable(
    tx,
    table,
    directory,
    idleTimeoutMs,
    completionTimeoutMs,
    `source_${table}`,
  );

  const sourceRows = await tx.unsafe<{ id: string; name: string }[]>(`
    SELECT DISTINCT s.id, s.name FROM source_${table} s
    JOIN source_indicator_version v ON v.${column} = s.id
  `);
  const coreRows = await tx.unsafe<{ id: string; name: string }[]>(`SELECT id, name FROM ${table}`);
  const coreIds = new Map(coreRows.map(({ id, name }) => [name, id]));
  const mapping = sourceRows.map(({ id, name }) => ({
    sourceId: id,
    coreId: coreIds.get(renames[name] ?? name),
    name,
  }));
  const unmatched = mapping.filter(({ coreId }) => coreId === undefined).map(({ name }) => name);

  if (unmatched.length > 0) {
    throw new Error(
      `No core ${label} for ${unmatched.join(', ')}: add it to ${file} or map its name here, and run \`db import-core-data\``,
    );
  }

  await tx.unsafe(
    `CREATE TEMP TABLE source_${table}_map (source_id uuid, core_id uuid) ON COMMIT DROP`,
  );
  if (mapping.length > 0) {
    await tx`INSERT INTO ${tx(`source_${table}_map`)} ${tx(
      mapping.map(({ sourceId, coreId }) => ({ source_id: sourceId, core_id: coreId })),
    )}`;
  }

  const [dangling] = await tx.unsafe<{ count: number }[]>(`
    SELECT count(*)::int AS count FROM source_indicator_version v
    WHERE v.${column} IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM source_${table}_map m WHERE m.source_id = v.${column})
  `);

  if (dangling?.count) {
    throw new Error(`${dangling.count} seeded versions name a ${label} the source does not hold`);
  }

  return loaded;
}

/**
 * Loads the versions through staging tables, pointing each at the core CI method and
 * comparator method its source's rows name and giving it the core providers and sources its
 * numerator and denominator sources map to, and answers how many rows each file held. The
 * source's own ids exist nowhere else, so a direct COPY would break the foreign keys; a row
 * or source with no core counterpart stops the load rather than being dropped.
 */
export async function loadIndicatorVersions(
  tx: postgres.TransactionSql,
  directory: string,
  idleTimeoutMs = COPY_IDLE_TIMEOUT_MS,
  completionTimeoutMs = idleTimeoutMs,
  legacySourceMap: LegacySourceMap = readLegacySourceMap(),
): Promise<LoadedIndicatorVersions> {
  await tx`CREATE TEMP TABLE source_indicator_version (LIKE indicator_version INCLUDING DEFAULTS) ON COMMIT DROP`;
  await tx`ALTER TABLE source_indicator_version ADD COLUMN numerator_source_id uuid, ADD COLUMN denominator_source_id uuid`;
  await loadTable(
    tx,
    'indicator_version',
    directory,
    idleTimeoutMs,
    completionTimeoutMs,
    'source_indicator_version',
  );

  const ciMethods = await mapToCoreData(
    tx,
    CI_METHOD_LOOKUP,
    directory,
    idleTimeoutMs,
    completionTimeoutMs,
  );
  const comparatorMethods = await mapToCoreData(
    tx,
    COMPARATOR_METHOD_LOOKUP,
    directory,
    idleTimeoutMs,
    completionTimeoutMs,
  );

  const header = await readCsvHeader(`${directory}/indicator_version.csv.gz`);
  // The id is always carried over, so the sources below find the versions they belong to.
  const columns = ['id', ...header.filter((c) => c !== 'id' && !LEGACY_SOURCE_COLUMNS.includes(c))];
  const columnList = columns.map((c) => `"${c}"`).join(', ');
  const mapped = new Map<string, string>(
    CORE_DATA_LOOKUPS.map(({ table, column }) => [column, `${table}_map.core_id`]),
  );
  // Reconnect the staged pointers after their batches exist, closing the version/batch cycle.
  mapped.set('upload_batch_id', 'NULL');
  mapped.set('data_table_confirmed_at', 'NULL');
  const selectList = columns.map((c) => mapped.get(c) ?? `v."${c}"`).join(', ');
  const joins = CORE_DATA_LOOKUPS.map(
    ({ table, column }) =>
      `LEFT JOIN source_${table}_map ${table}_map ON ${table}_map.source_id = v.${column}`,
  ).join('\n    ');
  const inserted = await tx.unsafe(`
    INSERT INTO indicator_version (${columnList})
    SELECT ${selectList} FROM source_indicator_version v
    ${joins}
  `);

  const hasLegacySources = header.some((c) => LEGACY_SOURCE_COLUMNS.includes(c));
  const sources = hasLegacySources
    ? await loadLegacySources(tx, directory, idleTimeoutMs, completionTimeoutMs, legacySourceMap)
    : { legacySources: 0, sources: 0 };

  return { ciMethods, comparatorMethods, versions: inserted.count, ...sources };
}

/** Gives the staged versions the core providers and sources their Fingertips sources map to. */
async function loadLegacySources(
  tx: postgres.TransactionSql,
  directory: string,
  idleTimeoutMs: number,
  completionTimeoutMs: number,
  legacySourceMap: LegacySourceMap,
): Promise<{ legacySources: number; sources: number }> {
  await tx`CREATE TEMP TABLE source_numerator_denominator_source (id uuid, name text, url text) ON COMMIT DROP`;
  const legacySources = await loadTable(
    tx,
    'numerator_denominator_source',
    directory,
    idleTimeoutMs,
    completionTimeoutMs,
    'source_numerator_denominator_source',
  );

  const used = await tx<{ id: string; name: string }[]>`
    SELECT s.id, s.name FROM source_numerator_denominator_source s
    WHERE s.id IN (
      SELECT numerator_source_id FROM source_indicator_version
      UNION SELECT denominator_source_id FROM source_indicator_version
    )
  `;
  const [dangling] = await tx<{ count: number }[]>`
    SELECT count(*)::int AS count FROM source_indicator_version v
    CROSS JOIN LATERAL (VALUES (v.numerator_source_id), (v.denominator_source_id)) AS p (id)
    WHERE p.id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM source_numerator_denominator_source s WHERE s.id = p.id)
  `;

  if (dangling?.count) {
    throw new Error(`${dangling.count} seeded sources name a row the source list does not hold`);
  }

  const pairs = await mapLegacySources(tx, used, legacySourceMap);

  await tx`CREATE TEMP TABLE source_pair_map (legacy_id uuid, position smallint, provider_id uuid, source_id uuid) ON COMMIT DROP`;
  if (pairs.length > 0) {
    await tx`INSERT INTO source_pair_map ${tx(
      pairs.map(({ legacyId, position, providerId, sourceId }) => ({
        legacy_id: legacyId,
        position,
        provider_id: providerId,
        source_id: sourceId,
      })),
    )}`;
  }

  const inserted = await tx`
    INSERT INTO indicator_version_source
      (indicator_version_id, part, position, provider_id, source_id)
    SELECT v.id, p.part, m.position, m.provider_id, m.source_id
    FROM source_indicator_version v
    CROSS JOIN LATERAL (
      VALUES ('numerator', v.numerator_source_id), ('denominator', v.denominator_source_id)
    ) AS p (part, legacy_id)
    JOIN source_pair_map m ON m.legacy_id = p.legacy_id
  `;

  return { legacySources, sources: inserted.count };
}
