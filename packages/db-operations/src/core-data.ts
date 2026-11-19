import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createDbFromClient, schema } from '@fphd/db';
import type postgres from 'postgres';

import {
  type CiMethodUpsertResult,
  parseCiMethodsFile,
  upsertCiMethods,
} from './ci-method-core-data.ts';
import {
  type ClassificationUpsertResult,
  parseClassificationsFile,
  upsertClassifications,
} from './classification-core-data.ts';
import {
  type DataProviderUpsertResult,
  parseDataProvidersFile,
  upsertDataProviders,
} from './data-provider-core-data.ts';
import {
  type GeographyCoreDataImport,
  importGeographyCoreData,
  readGeographyManifest,
} from './geography-core-data.ts';
import {
  type NamedUpsertResult,
  parseNamedRecordsFile,
  upsertComparatorMethods,
  upsertOrderedNames,
} from './named-core-data.ts';
import { parseTopicsFile } from './parse-topics-file.ts';
import {
  assertReferenceCoreDataPresent,
  importReferenceCoreData,
  type ReferenceCoreDataImport,
  readReferenceData,
} from './reference-core-data.ts';
import { parseSubtopicsFile, upsertSubtopics } from './subtopic-core-data.ts';
import { type UpsertResult, upsertTopics } from './topic-import.ts';

const { unit, valueType } = schema;

// Resolves identically from src/ and from dist/, both of which sit one level under the
// package root alongside data/.
const topicsFile = fileURLToPath(new URL('../data/topics.json', import.meta.url));
const subtopicsFile = fileURLToPath(new URL('../data/subtopics.json', import.meta.url));
const ciMethodsFile = fileURLToPath(new URL('../data/ci-methods.json', import.meta.url));
const classificationsFile = fileURLToPath(new URL('../data/classifications.json', import.meta.url));
const dataProvidersFile = fileURLToPath(new URL('../data/data-providers.json', import.meta.url));
const valueTypesFile = fileURLToPath(new URL('../data/value-types.json', import.meta.url));
const unitsFile = fileURLToPath(new URL('../data/units.json', import.meta.url));
const comparatorMethodsFile = fileURLToPath(
  new URL('../data/comparator-methods.json', import.meta.url),
);

export interface CoreDataImport {
  references: ReferenceCoreDataImport;
  geography: GeographyCoreDataImport;
  topics: UpsertResult;
  subtopics: Awaited<ReturnType<typeof upsertSubtopics>>;
  ciMethods: CiMethodUpsertResult;
  classifications: ClassificationUpsertResult;
  dataProviders: DataProviderUpsertResult;
  valueTypes: NamedUpsertResult;
  units: NamedUpsertResult;
  comparatorMethods: NamedUpsertResult;
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf-8'));
}

/**
 * Load the permanent content and upload reference catalogs every environment needs.
 * Idempotent upserts report rows absent from the files and record nothing in the audit log.
 * Future core reference or content data joins this function.
 */
export async function importCoreData(sql: postgres.Sql): Promise<CoreDataImport> {
  // Every file is read first, so a bad one fails before anything is written.
  const topicRecords = parseTopicsFile(readJson(topicsFile));
  const subtopicRecords = parseSubtopicsFile(readJson(subtopicsFile));
  const topicIds = new Set(topicRecords.map(({ id }) => id));
  if (subtopicRecords.some(({ topicId }) => !topicIds.has(topicId)))
    throw new Error('Subtopics name an unknown topic');
  const ciMethodRecords = parseCiMethodsFile(readJson(ciMethodsFile));
  const classificationRecords = parseClassificationsFile(readJson(classificationsFile));
  const dataProviderRecords = parseDataProvidersFile(readJson(dataProvidersFile));
  const valueTypeRecords = parseNamedRecordsFile('value types', readJson(valueTypesFile));
  const unitRecords = parseNamedRecordsFile('units', readJson(unitsFile));
  const comparatorMethodRecords = parseNamedRecordsFile(
    'comparator methods',
    readJson(comparatorMethodsFile),
  );
  const referenceRecords = readReferenceData();
  const geographyManifest = readGeographyManifest();
  const db = createDbFromClient(sql);

  return {
    references: await importReferenceCoreData(sql, referenceRecords),
    geography: await importGeographyCoreData(sql, geographyManifest),
    topics: await upsertTopics(db, topicRecords),
    subtopics: await upsertSubtopics(db, subtopicRecords),
    ciMethods: await upsertCiMethods(db, ciMethodRecords),
    classifications: await upsertClassifications(db, classificationRecords),
    dataProviders: await upsertDataProviders(db, dataProviderRecords),
    valueTypes: await upsertOrderedNames(db, valueType, valueTypeRecords),
    units: await upsertOrderedNames(db, unit, unitRecords),
    comparatorMethods: await upsertComparatorMethods(db, comparatorMethodRecords),
  };
}

interface CoreDataCounts {
  topics: number;
  subtopics: number;
  ciMethods: number;
  classifications: number;
  dataProviders: number;
  valueTypes: number;
  units: number;
  comparatorMethods: number;
}

/** The ids a committed list file holds. */
function namedIds(list: string, file: string): string[] {
  return parseNamedRecordsFile(list, readJson(file)).map(({ id }) => id);
}

/**
 * Guard for data that depends on core content: the dummy indicator links reference topics
 * and classifications by id, and the seed points its versions at the CI methods, value types,
 * units and comparator methods, so seeding an environment that has not imported them would
 * silently drop links. The classifications, value types, units and comparator methods are
 * checked id by id against the committed files, since a database may hold only some of them.
 * The seed and snapshot map Fingertips' sources onto the data providers.
 */
export async function assertCoreDataPresent(sql: postgres.Sql): Promise<void> {
  const topicIds = parseTopicsFile(readJson(topicsFile)).map(({ id }) => id);
  const subtopicIds = parseSubtopicsFile(readJson(subtopicsFile)).map(({ id }) => id);
  const classificationIds = parseClassificationsFile(readJson(classificationsFile)).map(
    ({ id }) => id,
  );
  const valueTypeIds = namedIds('value types', valueTypesFile);
  const unitIds = namedIds('units', unitsFile);
  const comparatorMethodIds = namedIds('comparator methods', comparatorMethodsFile);
  let counts: CoreDataCounts | undefined;
  try {
    [counts] = await sql<CoreDataCounts[]>`
      SELECT (SELECT count(*) FROM topic WHERE id IN ${sql(topicIds)})::int AS topics,
        (SELECT count(*) FROM subtopic WHERE id IN ${sql(subtopicIds)})::int AS subtopics,
        (SELECT count(*) FROM ci_method)::int AS "ciMethods",
        (SELECT count(*) FROM classification WHERE id IN ${sql(classificationIds)})::int
          AS classifications,
        (SELECT count(*) FROM data_provider)::int AS "dataProviders",
        (SELECT count(*) FROM value_type WHERE id IN ${sql(valueTypeIds)})::int AS "valueTypes",
        (SELECT count(*) FROM unit WHERE id IN ${sql(unitIds)})::int AS units,
        (SELECT count(*) FROM comparator_method WHERE id IN ${sql(comparatorMethodIds)})::int
          AS "comparatorMethods"
    `;
  } catch (error) {
    // undefined_table: point at the missing migration rather than surface the raw error.
    if ((error as { code?: string }).code === '42P01') {
      throw new Error('The core data tables are missing — run `db migrate` before seeding');
    }
    throw error;
  }
  if (!counts?.topics) {
    throw new Error('No topics in the database — run `db import-core-data` before seeding');
  }
  if (!counts.ciMethods) {
    throw new Error('No CI methods in the database — run `db import-core-data` before seeding');
  }
  if (!counts.dataProviders) {
    throw new Error('No data providers in the database — run `db import-core-data` before seeding');
  }

  const incomplete: [string, number, readonly string[]][] = [
    ['Topics', counts.topics, topicIds],
    ['Subtopics', counts.subtopics, subtopicIds],
    ['Classifications', counts.classifications, classificationIds],
    ['Value types', counts.valueTypes, valueTypeIds],
    ['Units', counts.units, unitIds],
    ['Comparator methods', counts.comparatorMethods, comparatorMethodIds],
  ];

  for (const [list, count, ids] of incomplete) {
    if (count < ids.length) {
      throw new Error(
        `${list} are missing from the database — run \`db import-core-data\` before seeding`,
      );
    }
  }
  await assertReferenceCoreDataPresent(sql);
}
