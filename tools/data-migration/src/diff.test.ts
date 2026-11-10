import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  DATA_MIGRATION_FORMAT_VERSION,
  DATA_MIGRATION_NULL,
  DATA_MIGRATION_SCHEMA,
  DATA_MIGRATION_TABLES,
  incrementalManifestSchema,
} from '@fphd/db-operations/data-migration-contract';
import { afterEach, describe, expect, it } from 'vitest';
import { encodeRow, readGzipCsv } from './csv.ts';
import { createIncremental } from './diff.ts';
import { fileRecord } from './files.ts';
import verifiedSettings from './pholio/verified-analytical-settings.ts';
import { deterministicUuid } from './prepare-baseline.ts';

const directories: string[] = [];

// The bridge tables have no id, so their files always carry their real columns.
const BRIDGE_HEADERS: Partial<Record<string, string[]>> = {
  observation_dimension: ['observation_id', 'dimension_value_id', 'dimension_type_id'],
  observation_note: ['observation_id', 'note_type_id'],
};

async function outputDirectory(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'fphd-increment-output-'));
  directories.push(parent);
  return join(parent, 'package');
}

async function snapshotBytes(directory: string) {
  return Promise.all(
    (await readdir(directory))
      .sort()
      .map(async (file) => [file, await readFile(join(directory, file))]),
  );
}

async function snapshot(
  id: string,
  time: string,
  rows: Partial<Record<string, string[][]>>,
  headers: Partial<Record<string, string[]>> = {},
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'fphd-migration-test-'));
  directories.push(directory);
  const tables: Record<string, { file: string; rows: number; bytes: number; sha256: string }> = {};
  for (const table of DATA_MIGRATION_TABLES) {
    const file = `${table}.csv.gz`;
    const values = rows[table] ?? [];
    await writeFile(
      join(directory, file),
      gzipSync(
        `${(headers[table] ?? BRIDGE_HEADERS[table] ?? ['id', 'name']).join(',')}\r\n${values.map((row) => encodeRow(row, true)).join('')}`,
      ),
    );
    tables[table] = await fileRecord(join(directory, file), file, values.length);
  }
  const relationshipFile = 'indicator-relationships.json';
  const relationshipPath = join(directory, relationshipFile);
  await writeFile(relationshipPath, '{}');
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      format_version: DATA_MIGRATION_FORMAT_VERSION,
      schema: DATA_MIGRATION_SCHEMA,
      migration_id: id,
      kind: 'baseline',
      predecessor: null,
      source: {
        system: 'fingertips',
        environment: 'live',
        database: 'source',
        snapshot_at: time,
        cutoff_at: time,
      },
      source_csv_null: DATA_MIGRATION_NULL,
      id_mapping: 'deterministic-uuidv7-v1',
      relationships: await fileRecord(relationshipPath, relationshipFile, 0),
      tables,
    }),
  );
  return directory;
}

async function records(path: string): Promise<string[][]> {
  const rows: string[][] = [];
  for await (const row of readGzipCsv(path)) rows.push(row);
  return rows;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('createIncremental', () => {
  it('captures inserts, corrections and deletes with the predecessor identity', async () => {
    const [one, two, same, removed] = ['1', '2', '3', '4']
      .map((key) => deterministicUuid('data_source', key))
      .sort();
    const previous = await snapshot('baseline-1', '2026-09-20T10:00:00Z', {
      data_source: [
        [one as string, 'Old'],
        [same as string, 'Same'],
        [removed as string, 'Removed'],
      ],
    });
    const current = await snapshot('increment-2', '2026-09-21T10:00:00Z', {
      data_source: [
        [one as string, 'Corrected'],
        [two as string, 'Added'],
        [same as string, 'Same'],
      ],
    });
    const currentManifestPath = join(current, 'manifest.json');
    const currentManifest = JSON.parse(await readFile(currentManifestPath, 'utf8'));
    const corrections = [
      {
        source_uid: 96485373,
        indicator_id: 93607,
        field: 'UpperCI99_8',
        original_value: 0,
        corrected_value: 91.73290567213279,
        evidence_url:
          'https://fingertips.phe.org.uk/static-reports/public-health-technical-guidance/Basic_statistics/Proportions.html',
      },
    ];
    currentManifest.source.observation_corrections = corrections;
    currentManifest.source.analytical_reconciliations = verifiedSettings;
    await writeFile(currentManifestPath, JSON.stringify(currentManifest));
    const output = await outputDirectory();

    await createIncremental(previous, current, output, 'increment-2');

    const manifest = incrementalManifestSchema.parse(
      JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')),
    );
    expect(manifest.predecessor).toBe('baseline-1');
    expect(manifest.source.observation_corrections).toEqual(corrections);
    expect(manifest.source.analytical_reconciliations).toEqual(verifiedSettings);
    expect(manifest.tables.data_source?.upserts.rows).toBe(2);
    expect(manifest.tables.data_source?.deletes.rows).toBe(1);
    expect(await records(join(output, 'data_source.csv.gz'))).toEqual([
      ['id', 'name'],
      [one, 'Corrected'],
      [two, 'Added'],
    ]);
    expect(await records(join(output, 'data_source.deletes.csv.gz'))).toEqual([['id'], [removed]]);
  });

  it('carries the tables the importer reads whole in full, with no deletes', async () => {
    const [kept, removed] = ['1', '2'].map((key) => deterministicUuid('ci_method', key)).sort();
    const previous = await snapshot('baseline-1', '2026-09-20T10:00:00Z', {
      ci_method: [
        [kept as string, 'Kept'],
        [removed as string, 'Removed'],
      ],
    });
    const current = await snapshot('increment-2', '2026-09-21T10:00:00Z', {
      ci_method: [[kept as string, 'Kept']],
    });
    const output = await outputDirectory();

    await createIncremental(previous, current, output, 'increment-2');

    const manifest = incrementalManifestSchema.parse(
      JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')),
    );
    expect(manifest.tables.ci_method?.deletes.rows).toBe(0);
    expect(await records(join(output, 'ci_method.csv.gz'))).toEqual([
      ['id', 'name'],
      [kept, 'Kept'],
    ]);
  });

  it('compares bridge rows by observation and dimension type, and deletes them by that key', async () => {
    const [first, second] = ['1', '2'].map((key) => deterministicUuid('observation', key)).sort();
    const [sex, age] = ['1', '2'].map((key) => deterministicUuid('dimension_type', key)).sort();
    const [male, female, adults] = ['1', '2', '3']
      .map((key) => deterministicUuid('dimension_value', key))
      .sort();
    const previous = await snapshot('baseline-1', '2026-09-20T10:00:00Z', {
      observation_dimension: [
        [first as string, male as string, sex as string],
        [first as string, adults as string, age as string],
        [second as string, male as string, sex as string],
      ],
    });
    const current = await snapshot('increment-2', '2026-09-21T10:00:00Z', {
      observation_dimension: [
        [first as string, male as string, sex as string],
        [second as string, female as string, sex as string],
        [second as string, adults as string, age as string],
      ],
    });
    const output = await outputDirectory();

    await createIncremental(previous, current, output, 'increment-2');

    expect(await records(join(output, 'observation_dimension.csv.gz'))).toEqual([
      ['observation_id', 'dimension_value_id', 'dimension_type_id'],
      [second, female, sex],
      [second, adults, age],
    ]);
    expect(await records(join(output, 'observation_dimension.deletes.csv.gz'))).toEqual([
      ['observation_id', 'dimension_type_id'],
      [first, age],
    ]);
  });

  it('rejects bridge rows that are not ordered by their key', async () => {
    const observation = deterministicUuid('observation', '1');
    const [disclosure, quality] = ['1', '2']
      .map((key) => deterministicUuid('note_type', key))
      .sort();
    const previous = await snapshot('baseline-1', '2026-09-20T10:00:00Z', {});
    const current = await snapshot('increment-2', '2026-09-21T10:00:00Z', {
      observation_note: [
        [observation, quality as string],
        [observation, disclosure as string],
      ],
    });
    const output = await outputDirectory();

    await expect(createIncremental(previous, current, output, 'increment-2')).rejects.toThrow(
      'observation_note rows in the current snapshot are not ordered by observation_id, note_type_id',
    );
  });

  it('rejects a snapshot whose rows are not ordered by stable id', async () => {
    const one = deterministicUuid('ci_method', '1');
    const two = deterministicUuid('ci_method', '2');
    const previous = await snapshot('baseline-1', '2026-09-20T10:00:00Z', {
      ci_method: [
        [two, 'Second'],
        [one, 'First'],
      ],
    });
    const current = await snapshot('increment-2', '2026-09-21T10:00:00Z', {});
    const output = await outputDirectory();

    await expect(createIncremental(previous, current, output, 'increment-2')).rejects.toThrow(
      /previous snapshot are not ordered by id/,
    );
  });
});

it('resends unchanged versions when reference names change', async () => {
  const versionId = deterministicUuid('indicator_version', '1');
  const sourceId = deterministicUuid('numerator_denominator_source', '1');
  const previous = await snapshot('baseline-1', '2026-09-20T10:00:00Z', {
    indicator_version: [[versionId, 'Unchanged version']],
    numerator_denominator_source: [[sourceId, 'Old source']],
  });
  const current = await snapshot('increment-2', '2026-09-21T10:00:00Z', {
    indicator_version: [[versionId, 'Unchanged version']],
    numerator_denominator_source: [[sourceId, 'New source']],
  });
  const output = await outputDirectory();
  await createIncremental(previous, current, output, 'increment-2');
  expect(await records(join(output, 'indicator_version.csv.gz'))).toEqual([
    ['id', 'name'],
    [versionId, 'Unchanged version'],
  ]);
});

it('carries the whole changed core catalog without resending unchanged indicator versions', async () => {
  const versionId = deterministicUuid('indicator_version', '1');
  const [areaId, unchangedAreaId] = ['1', '2'].map((key) => deterministicUuid('area', key)).sort();
  const unchangedArea = [unchangedAreaId as string, 'Unchanged area'];
  const previous = await snapshot('baseline-1', '2026-09-20T10:00:00Z', {
    indicator_version: [[versionId, 'Unchanged version']],
    area: [[areaId as string, 'Old area name'], unchangedArea],
  });
  const current = await snapshot('increment-2', '2026-09-21T10:00:00Z', {
    indicator_version: [[versionId, 'Unchanged version']],
    area: [[areaId as string, 'New area name'], unchangedArea],
  });
  const output = await outputDirectory();
  await createIncremental(previous, current, output, 'increment-2');
  expect(await records(join(output, 'indicator_version.csv.gz'))).toEqual([['id', 'name']]);
  // The receiver maps observation areas using only the package's area rows.
  expect(await records(join(output, 'area.csv.gz'))).toEqual([
    ['id', 'name'],
    [areaId, 'New area name'],
    unchangedArea,
  ]);
});

it('captures a change from SQL NULL to an empty string', async () => {
  const id = deterministicUuid('data_source', '1');
  const headers = { data_source: ['id', 'name', 'url'] };
  const previous = await snapshot(
    'baseline-1',
    '2026-09-20T10:00:00Z',
    {
      data_source: [[id, 'Source', DATA_MIGRATION_NULL]],
    },
    headers,
  );
  const current = await snapshot(
    'increment-2',
    '2026-09-21T10:00:00Z',
    {
      data_source: [[id, 'Source', '']],
    },
    headers,
  );
  const output = await outputDirectory();
  await createIncremental(previous, current, output, 'increment-2');
  expect(await records(join(output, 'data_source.csv.gz'))).toEqual([
    ['id', 'name', 'url'],
    [id, 'Source', ''],
  ]);
});

it.each(['previous', 'current', 'previous symlink', 'current symlink'])(
  'refuses output aliasing the %s snapshot without changing either input',
  async (alias) => {
    const previous = await snapshot('baseline-1', '2026-09-20T10:00:00Z', {});
    const current = await snapshot('increment-2', '2026-09-21T10:00:00Z', {});
    const before = await Promise.all([snapshotBytes(previous), snapshotBytes(current)]);
    const target = alias.startsWith('previous') ? previous : current;
    let output = target;
    if (alias.endsWith('symlink')) {
      output = await outputDirectory();
      await symlink(target, output, 'dir');
    }
    await expect(createIncremental(previous, current, output, 'increment-2')).rejects.toThrow(
      /output.*(exists|alias)/i,
    );
    expect(await Promise.all([snapshotBytes(previous), snapshotBytes(current)])).toEqual(before);
  },
);

it('refuses an existing output package without changing it', async () => {
  const previous = await snapshot('baseline-1', '2026-09-20T10:00:00Z', {});
  const current = await snapshot('increment-2', '2026-09-21T10:00:00Z', {});
  const output = await outputDirectory();
  await createIncremental(previous, current, output, 'increment-2');
  const before = await snapshotBytes(output);
  await expect(createIncremental(previous, current, output, 'increment-2')).rejects.toThrow(
    /output.*exists/i,
  );
  expect(await snapshotBytes(output)).toEqual(before);
});

it('removes staged output after a late failure and preserves both source snapshots', async () => {
  const one = deterministicUuid('observation', '1');
  const two = deterministicUuid('observation', '2');
  const previous = await snapshot('baseline-1', '2026-09-20T10:00:00Z', {
    observation: [
      [two, 'Second'],
      [one, 'First'],
    ],
  });
  const current = await snapshot('increment-2', '2026-09-21T10:00:00Z', {});
  const output = await outputDirectory();
  const before = await Promise.all([snapshotBytes(previous), snapshotBytes(current)]);
  await expect(createIncremental(previous, current, output, 'increment-2')).rejects.toThrow(
    /previous snapshot are not ordered/,
  );
  expect(await readdir(join(output, '..'))).toEqual([]);
  expect(await Promise.all([snapshotBytes(previous), snapshotBytes(current)])).toEqual(before);
  await mkdir(output);
  await writeFile(join(output, 'keep.txt'), 'completed output');
  await expect(createIncremental(previous, current, output, 'increment-2')).rejects.toThrow(
    /output.*exists/i,
  );
  expect(await readFile(join(output, 'keep.txt'), 'utf8')).toBe('completed output');
});
