import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { z } from '@fphd/config';
import { readCsvHeader, SEED_TABLES, sha256 } from '@fphd/db-operations';

import { type DownloadResume, downloadFile } from './download.ts';

const runFile = promisify(execFile);
const publishedSource = 'PHOLIO_LIVE_B export';
const publishedCsvNull = '__FPHD_NULL_5f92c66de4b849b4a717c23f5cbdb8a1__';
// These independently recorded benchmark counts reject accidental source mix-ups.
// The benchmark setup establishes lineage; these counts are not a provenance signature.
// The indicator count omits test indicator 94204, as the exporter always does.
const expectedSourceIndicators = 1_329;
const expectedObservations = 29_656_329;
// The development archive's fixed exclusion list must match its exporter.
const excludedIndicators = [90_366, 90_776, 92_774, 93_280];
const expectedExportedIndicators = expectedSourceIndicators - excludedIndicators.length;

const sourceManifestSchema = z.object({
  source: z.literal(publishedSource),
  source_database: z.literal('pholio_live_b'),
  source_indicators: z.literal(expectedSourceIndicators),
  // Eligible source observations before export-specific exclusions fingerprint the clone.
  source_observations: z.literal(expectedObservations),
  excluded_indicators: z.array(z.number().int()),
  excluded_observations: z.number().int().nonnegative(),
  source_csv_null: z.literal(publishedCsvNull),
  // Stamped by the shared reference-name preparation step.
  reference_names: z.literal('tidied').optional(),
  tables: z.record(
    z.string(),
    z.object({
      rows: z.number().int().nonnegative(),
      bytes: z.number().int().positive(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});
const manifestSchema = sourceManifestSchema.extend({
  id_mapping: z.literal('deterministic-uuidv7-v1'),
  // Stamped once the export names its writers by user id, as the actor columns hold them.
  writers: z.literal('users').optional(),
});

export type PublishedManifest = z.infer<typeof manifestSchema>;

function sameMembers(left: number[], right: number[]): boolean {
  const sorted = (list: number[]) => [...list].sort((a, b) => a - b).join(',');
  return sorted(left) === sorted(right);
}

export async function verifyPublishedSnapshot(directory: string): Promise<PublishedManifest> {
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')),
  );
  const sourceManifest = sourceManifestSchema.parse(
    JSON.parse(await readFile(join(directory, 'source-manifest.json'), 'utf8')),
  );
  const actualTables = Object.keys(manifest.tables).sort();
  const expectedTables = [...SEED_TABLES].sort().join(',');
  if (
    actualTables.join(',') !== expectedTables ||
    Object.keys(sourceManifest.tables).sort().join(',') !== expectedTables
  ) {
    throw new Error('Published snapshot table list does not match the seed schema');
  }
  if (sourceManifest.reference_names !== 'tidied') {
    throw new Error(
      'Published snapshot predates the tidied reference names and must be regenerated',
    );
  }
  // An older archive names its writers as text, which the import would refuse deep inside.
  if (manifest.writers !== 'users') {
    throw new Error('Published snapshot predates users as writers and must be regenerated');
  }
  if (!sameMembers(sourceManifest.excluded_indicators, excludedIndicators)) {
    throw new Error('Published snapshot was exported with a different exclusion list');
  }
  if (
    manifest.tables.indicator?.rows !== expectedExportedIndicators ||
    // The export turns each exported source indicator into one published version.
    manifest.tables.indicator_version?.rows !== expectedExportedIndicators ||
    // Intentional export exclusions account for the difference from the source count.
    manifest.tables.observation?.rows !==
      expectedObservations - sourceManifest.excluded_observations
  ) {
    throw new Error('Published snapshot row counts do not match the published benchmark clone');
  }
  for (const table of SEED_TABLES) {
    const expected = manifest.tables[table];
    if (!expected || expected.rows === 0)
      throw new Error(`Published snapshot has no ${table} rows`);
    if (expected.rows !== sourceManifest.tables[table]?.rows) {
      throw new Error(`Published snapshot source row count differs for ${table}`);
    }
    const file = join(directory, `${table}.csv.gz`);
    if ((await sha256(file)) !== expected.sha256) {
      throw new Error(`Published snapshot checksum failed for ${table}`);
    }
  }
  // The seed COPY takes its column list from each file, so an archive exported before a
  // column existed would only fail deep inside the import. Name the gap here instead.
  const versionColumns = await readCsvHeader(join(directory, 'indicator_version.csv.gz'));
  if (!versionColumns.includes('slug')) {
    throw new Error('Published snapshot indicator_version.csv.gz carries no slug column');
  }
  // One without numerator holds Pholio's Count as the count even where it is the numerator.
  const observationColumns = await readCsvHeader(join(directory, 'observation.csv.gz'));
  if (!observationColumns.includes('numerator')) {
    throw new Error('Published snapshot predates the numerator column and must be regenerated');
  }
  return manifest;
}

export async function downloadPublishedSnapshot(
  url: string,
  expectedSha256: string,
  onResume?: (resume: DownloadResume) => void,
): Promise<{ directory: string; manifest: PublishedManifest; cleanup: () => Promise<void> }> {
  const directory = await mkdtemp(join(tmpdir(), 'fphd-published-'));
  try {
    const archive = join(directory, 'snapshot.tar');
    await downloadFile(url, archive, 'Published snapshot', { onResume });
    if ((await sha256(archive)) !== expectedSha256) {
      throw new Error('Published snapshot archive checksum failed');
    }

    const { stdout } = await runFile('tar', ['-tf', archive]);
    const expectedFiles = new Set([
      'manifest.json',
      'source-manifest.json',
      ...SEED_TABLES.map((table) => `${table}.csv.gz`),
    ]);
    const archivedFiles = stdout.trim().split('\n');
    // An archive with year_type predates the period types: its versions point at Pholio's.
    if (archivedFiles.includes('year_type.csv.gz')) {
      throw new Error('Published snapshot predates the period type change and must be regenerated');
    }
    // One with value_type or unit predates the service's value types and units, likewise.
    if (archivedFiles.includes('value_type.csv.gz') || archivedFiles.includes('unit.csv.gz')) {
      throw new Error(
        'Published snapshot predates the value type and unit change and must be regenerated',
      );
    }
    if (
      archivedFiles.length !== expectedFiles.size ||
      archivedFiles.some((file) => !expectedFiles.has(file))
    ) {
      throw new Error('Published snapshot archive contains unexpected files');
    }
    await runFile('tar', ['-xf', archive, '-C', directory]);
    const manifest = await verifyPublishedSnapshot(directory);
    return { directory, manifest, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
