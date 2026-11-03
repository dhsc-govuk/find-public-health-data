import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import {
  baselineManifestSchema,
  DATA_MIGRATION_NULL,
} from '@fphd/db-operations/data-migration-contract';
import { afterEach, describe, expect, it } from 'vitest';

import { readGzipCsv } from './csv.ts';
import { fileRecord } from './files.ts';
import { deterministicUuid, prepareBaseline, rekeyDirectory } from './prepare-baseline.ts';
import { FOREIGN_KEYS, TABLES } from './tables.ts';
import { verifyPackageFiles } from './verify.ts';

const directories: string[] = [];

async function sourceExport(): Promise<{ directory: string; relationships: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'fphd-source-test-'));
  directories.push(directory);
  const tables: Record<string, Awaited<ReturnType<typeof fileRecord>>> = {};
  for (const table of TABLES) {
    const file = `${table}.csv.gz`;
    const rows = table === 'indicator' ? 1 : 0;
    const header = ['id', ...Object.keys(FOREIGN_KEYS[table] ?? {})].join(',');
    await writeFile(
      join(directory, file),
      gzipSync(table === 'indicator' ? `${header}\n1\n` : `${header}\n`),
    );
    tables[table] = await fileRecord(join(directory, file), file, rows);
  }
  await writeFile(
    join(directory, 'source-manifest.json'),
    JSON.stringify({
      source: {
        system: 'fingertips',
        environment: 'live',
        database: 'fphd_new',
        snapshot_at: '2026-09-22T10:00:00Z',
        cutoff_at: '2026-09-22T10:00:00Z',
      },
      exported_indicators: 1,
      indicator_selection: { kind: 'approved', indicators: [1] },
      excluded_non_approved_indicators: 2,
      excluded_future_observations: 0,
      source_csv_null: DATA_MIGRATION_NULL,
      tables,
    }),
  );
  const relationships = join(directory, 'reviewed-relationships.json');
  await writeFile(
    relationships,
    JSON.stringify({
      approval: {
        approvedBy: 'migration test',
        approvedAt: '2026-09-22T10:00:00Z',
        basis: 'integration fixture',
      },
      indicators: [1],
      indicatorTopics: [{ fingertipsId: 1, topicId: '019de0d5-c800-7001-8000-000000000001' }],
      indicatorDataUpdatedAt: {},
      classifications: [],
      indicatorClassifications: [],
    }),
  );
  return { directory, relationships };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('prepareBaseline', () => {
  it('verifies and prepares a complete approved source snapshot', async () => {
    const source = await sourceExport();

    await prepareBaseline(
      source.directory,
      'baseline-1',
      source.relationships,
      join(source.directory, 'prepared'),
    );

    const manifest = baselineManifestSchema.parse(
      JSON.parse(await readFile(join(source.directory, 'prepared', 'manifest.json'), 'utf8')),
    );
    expect(manifest.tables.indicator?.rows).toBe(1);
    const rows: string[][] = [];
    for await (const row of readGzipCsv(join(source.directory, 'prepared', 'indicator.csv.gz')))
      rows.push(row);
    expect(rows).toEqual([
      ['id', 'short_id'],
      [deterministicUuid('indicator', '1'), '1'],
    ]);
  });

  it('retains profile reference names and unrepresentable frequency prose in package provenance', async () => {
    const source = await sourceExport();
    const metadata = [
      {
        indicator_id: 1,
        profile_id: 10,
        name: 'B03 - Source indicator',
        frequency: 'Every 3 years',
        structured_frequency: null,
      },
    ];
    const path = join(source.directory, 'source-manifest.json');
    const input = JSON.parse(await readFile(path, 'utf8'));
    input.source.profile_metadata = metadata;
    await writeFile(path, JSON.stringify(input));
    await prepareBaseline(
      source.directory,
      'baseline-1',
      source.relationships,
      join(source.directory, 'prepared'),
    );
    const manifest = baselineManifestSchema.parse(
      JSON.parse(await readFile(join(source.directory, 'prepared', 'manifest.json'), 'utf8')),
    );
    expect(manifest.source.profile_metadata).toEqual(metadata);
  });

  it('prepares the same source under two migration IDs without changing its files', async () => {
    const source = await sourceExport();
    const before = await readFile(join(source.directory, 'indicator.csv.gz'));
    const manifestBefore = await readFile(join(source.directory, 'source-manifest.json'));
    const first = join(source.directory, 'first');
    const second = join(source.directory, 'second');
    await prepareBaseline(source.directory, 'baseline-1', source.relationships, first);
    await prepareBaseline(source.directory, 'baseline-2', source.relationships, second);
    expect(await readFile(join(source.directory, 'indicator.csv.gz'))).toEqual(before);
    expect(await readFile(join(source.directory, 'source-manifest.json'))).toEqual(manifestBefore);
    const a = JSON.parse(await readFile(join(first, 'manifest.json'), 'utf8'));
    const b = JSON.parse(await readFile(join(second, 'manifest.json'), 'utf8'));
    expect(a.tables).toEqual(b.tables);
    await expect(
      prepareBaseline(source.directory, 'baseline-3', source.relationships, first),
    ).rejects.toThrow(/already exists/);
    expect(await readFile(join(first, 'manifest.json'), 'utf8')).toBe(
      `${JSON.stringify(a, null, 2)}\n`,
    );
  });

  it('removes partial preparation after a late failure and retries from the same source', async () => {
    const source = await sourceExport();
    const path = join(source.directory, 'area.csv.gz');
    const original = await readFile(path);
    const manifestPath = join(source.directory, 'source-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    await writeFile(path, gzipSync('id,area_type_id\ninvalid,1\n'));
    manifest.tables.area = await fileRecord(path, 'area.csv.gz', 1);
    await writeFile(manifestPath, JSON.stringify(manifest));
    const output = join(source.directory, 'prepared');
    const indicatorBefore = await readFile(join(source.directory, 'indicator.csv.gz'));
    await expect(
      prepareBaseline(source.directory, 'baseline-1', source.relationships, output),
    ).rejects.toThrow(/area id is not a positive integer/);
    expect(await readFile(join(source.directory, 'indicator.csv.gz'))).toEqual(indicatorBefore);
    expect((await readdir(source.directory)).some((name) => name.includes('prepared'))).toBe(false);
    await writeFile(path, original);
    manifest.tables.area = await fileRecord(path, 'area.csv.gz', 0);
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(
      prepareBaseline(source.directory, 'baseline-1', source.relationships, output),
    ).resolves.toBeUndefined();
  });

  it('rejects a source file changed after export', async () => {
    const source = await sourceExport();
    await writeFile(join(source.directory, 'indicator.csv.gz'), gzipSync('id\n2\n'));

    await expect(
      prepareBaseline(
        source.directory,
        'baseline-1',
        source.relationships,
        join(source.directory, 'prepared'),
      ),
    ).rejects.toThrow(/integrity check failed for indicator/);
  });

  it('rejects indicators without topics before modifying source files', async () => {
    const source = await sourceExport();
    const path = join(source.directory, 'indicator.csv.gz');
    const original = await readFile(path);
    const relationships = JSON.parse(await readFile(source.relationships, 'utf8'));
    await writeFile(
      source.relationships,
      JSON.stringify({ ...relationships, indicatorTopics: [] }),
    );

    await expect(
      prepareBaseline(
        source.directory,
        'baseline-1',
        source.relationships,
        join(source.directory, 'prepared'),
      ),
    ).rejects.toThrow('Reviewed indicators have no topic: 1');
    expect(await readFile(path)).toEqual(original);
    await expect(
      readFile(join(source.directory, 'prepared', 'manifest.json')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('rekeyDirectory', () => {
  it('rekeys every foreign key to the id its referenced row gets, keeping nulls', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fphd-rekey-test-'));
    directories.push(directory);
    const rows: Partial<Record<(typeof TABLES)[number], string[]>> = {
      indicator: ['108'],
      upload_batch: ['5,108,108,__NULL__'],
      observation: ['2,108,40,5'],
      observation_dimension: ['9,2,77,3'],
    };
    for (const table of TABLES) {
      const header = ['id', ...Object.keys(FOREIGN_KEYS[table] ?? {})].join(',');
      const body = (rows[table] ?? []).map((row) =>
        row.replaceAll('__NULL__', DATA_MIGRATION_NULL),
      );
      await writeFile(
        join(directory, `${table}.csv.gz`),
        gzipSync([header, ...body, ''].join('\n')),
      );
    }

    await rekeyDirectory(directory, undefined);

    const read = async (table: string) => {
      const out: string[][] = [];
      for await (const row of readGzipCsv(join(directory, `${table}.csv.gz`))) out.push(row);
      return out;
    };
    expect((await read('upload_batch'))[1]).toEqual([
      deterministicUuid('upload_batch', '5'),
      deterministicUuid('indicator', '108'),
      deterministicUuid('indicator_version', '108'),
      DATA_MIGRATION_NULL,
    ]);
    expect((await read('observation'))[1]).toEqual([
      deterministicUuid('observation', '2'),
      deterministicUuid('indicator', '108'),
      deterministicUuid('area', '40'),
      deterministicUuid('upload_batch', '5'),
    ]);
    expect((await read('observation_dimension'))[1]).toEqual([
      deterministicUuid('observation_dimension', '9'),
      deterministicUuid('observation', '2'),
      deterministicUuid('dimension_value', '77'),
      deterministicUuid('dimension_type', '3'),
    ]);
  });
});

describe('verifyPackageFiles', () => {
  it('passes the package prepareBaseline wrote and refuses one with a file changed after', async () => {
    const source = await sourceExport();
    await prepareBaseline(
      source.directory,
      'baseline-1',
      source.relationships,
      join(source.directory, 'prepared'),
    );
    const manifest = baselineManifestSchema.parse(
      JSON.parse(await readFile(join(source.directory, 'prepared', 'manifest.json'), 'utf8')),
    );

    await expect(
      verifyPackageFiles(join(source.directory, 'prepared'), manifest),
    ).resolves.toBeUndefined();

    await writeFile(join(source.directory, 'prepared', 'observation.csv.gz'), gzipSync('id\n1\n'));
    await expect(verifyPackageFiles(join(source.directory, 'prepared'), manifest)).rejects.toThrow(
      'Package integrity check failed for observation.csv.gz',
    );
  });
});
