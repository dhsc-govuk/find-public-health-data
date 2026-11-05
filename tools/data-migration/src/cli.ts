import { readFile, writeFile } from 'node:fs/promises';
import { createArchive } from './archive.ts';
import { createIncremental } from './diff.ts';
import { exportDevSnapshot } from './export-dev-snapshot.ts';
import {
  APPROVED_INDICATORS_FILE,
  parseApprovedIndicators,
  parseIndicatorIds,
} from './indicator-checks.ts';
import { exportLegacySeed } from './legacy-seed.ts';
import { exportCoreReferenceData } from './pholio/export-core-reference-data.ts';
import { exportPholio } from './pholio/export-pholio.ts';
import { prepareBaseline } from './prepare-baseline.ts';
import { importPrototypeSeed } from './prototype-seed.ts';
import { taxonomyRelationships } from './taxonomy.ts';

function argumentsFor(argv: readonly string[]): { command: string; values: Map<string, string> } {
  const [command = '', ...rest] = argv;
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    const value = rest[index + 1];
    if (!name?.startsWith('--') || value === undefined)
      throw new Error(`Invalid argument: ${name ?? ''}`);
    values.set(name.slice(2), value);
  }
  return { command, values };
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main(argv: readonly string[]): Promise<void> {
  const { command, values } = argumentsFor(argv);
  switch (command) {
    case 'export-pholio': {
      const rawExcluded = values.get('excluded-indicators');
      const rawSuperseded = values.get('superseded-sentinel-rows');
      await exportPholio({
        connectionString: requiredEnvironment('PHOLIO_CONNECTION_STRING'),
        outDir: required(values, 'out-dir'),
        expectedDatabase: required(values, 'expected-database'),
        indicatorSelection: {
          kind: 'approved',
          indicators: parseApprovedIndicators(
            await readFile(values.get('approved-indicators') ?? APPROVED_INDICATORS_FILE, 'utf8'),
          ),
        },
        excludedIndicators: rawExcluded ? parseIndicatorIds(rawExcluded) : [],
        supersededSentinelIndicators: rawSuperseded
          ? parseIndicatorIds(rawSuperseded, '--superseded-sentinel-rows')
          : [],
      });
      return;
    }
    case 'export-core-reference-data':
      await exportCoreReferenceData({
        connectionString: requiredEnvironment('PHOLIO_CONNECTION_STRING'),
        expectedDatabase: required(values, 'expected-database'),
        backupSha256: required(values, 'backup-sha256'),
        outDir: required(values, 'out-dir'),
      });
      return;
    case 'prepare-baseline':
      await prepareBaseline(
        required(values, 'directory'),
        required(values, 'migration-id'),
        required(values, 'relationships'),
        required(values, 'out-dir'),
      );
      return;
    case 'create-incremental':
      await createIncremental(
        required(values, 'previous'),
        required(values, 'current'),
        required(values, 'out-dir'),
        required(values, 'migration-id'),
      );
      return;
    case 'archive':
      await createArchive(required(values, 'directory'), required(values, 'output'));
      return;
    case 'generate-taxonomy-relationships': {
      const json = async (name: string) =>
        JSON.parse(await readFile(required(values, name), 'utf8'));
      const [source, topics, subtopics, classifications] = await Promise.all(
        ['source', 'topics', 'subtopics', 'classifications'].map(json),
      );
      const selection = values.has('indicators')
        ? parseIndicatorIds(await readFile(required(values, 'indicators'), 'utf8'))
        : undefined;
      const file = taxonomyRelationships(source, topics, subtopics, classifications, selection);
      await writeFile(required(values, 'output'), `${JSON.stringify(file, null, 2)}\n`);
      return;
    }
    case 'export-legacy-seed':
      await exportLegacySeed(
        requiredEnvironment('MSSQL_CONNECTION_STRING'),
        required(values, 'out-dir'),
      );
      return;
    case 'import-prototype-seed':
      await importPrototypeSeed({
        databaseUrl: requiredEnvironment('SOURCE_DATABASE_URL'),
        dataCsv: required(values, 'data-csv'),
        metadataJson: required(values, 'metadata-json'),
        areaTypesJson: required(values, 'area-types-json'),
        areaDirectory: required(values, 'area-dir'),
        seedDirectory: required(values, 'seed-dir'),
        outDirectory: required(values, 'out-dir'),
      });
      return;
    case 'export-dev-snapshot':
      await exportDevSnapshot({
        connectionString: requiredEnvironment('PHOLIO_CONNECTION_STRING'),
        outDir: required(values, 'out-dir'),
      });
      return;
    default:
      throw new Error(
        'Usage: data-migration <export-pholio|export-core-reference-data|prepare-baseline|create-incremental|archive|generate-taxonomy-relationships|export-legacy-seed|import-prototype-seed|export-dev-snapshot> --option value',
      );
  }
}

await main(process.argv.slice(2));
