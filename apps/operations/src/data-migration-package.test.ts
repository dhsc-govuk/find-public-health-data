import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';

import {
  DATA_MIGRATION_FORMAT_VERSION,
  DATA_MIGRATION_NULL,
  DATA_MIGRATION_SCHEMA,
  DATA_MIGRATION_TABLES,
} from '@fphd/db-operations';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadDataMigration } from './data-migration-package.ts';

const runFile = promisify(execFile);
const directories: string[] = [];

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function packageArchive(
  options: {
    linkedFile?: boolean;
    wrongBytes?: boolean;
    wrongRelationshipBytes?: boolean;
    unexpectedFile?: boolean;
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'fphd-migration-package-test-'));
  directories.push(directory);
  const tables: Record<string, { file: string; rows: number; bytes: number; sha256: string }> = {};
  for (const table of DATA_MIGRATION_TABLES) {
    const file = `${table}.csv.gz`;
    const contents = gzipSync('id\n');
    await writeFile(join(directory, file), contents);
    tables[table] = { file, rows: 0, bytes: contents.length, sha256: sha256(contents) };
  }
  if (options.wrongBytes && tables.observation) tables.observation.bytes += 1;
  if (options.linkedFile) {
    await rm(join(directory, 'observation.csv.gz'));
    await symlink('value_type.csv.gz', join(directory, 'observation.csv.gz'));
  }

  const relationshipsFile = 'indicator-relationships.json';
  const relationships = Buffer.from(
    JSON.stringify({
      indicators: [],
      indicatorTopics: [],
      indicatorDataUpdatedAt: {},
      classifications: [],
      indicatorClassifications: [],
    }),
  );
  await writeFile(join(directory, relationshipsFile), relationships);
  const manifest = {
    format_version: DATA_MIGRATION_FORMAT_VERSION,
    schema: DATA_MIGRATION_SCHEMA,
    migration_id: 'baseline-1',
    kind: 'baseline',
    predecessor: null,
    source: {
      system: 'fingertips',
      environment: 'live',
      database: 'fphd_new',
      snapshot_at: '2026-09-22T10:00:00Z',
      cutoff_at: '2026-09-22T10:00:00Z',
    },
    source_csv_null: DATA_MIGRATION_NULL,
    id_mapping: 'deterministic-uuidv7-v1',
    relationships: {
      file: relationshipsFile,
      rows: 0,
      bytes: relationships.length + (options.wrongRelationshipBytes ? 1 : 0),
      sha256: sha256(relationships),
    },
    tables,
  };
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  const files = [
    'manifest.json',
    relationshipsFile,
    ...DATA_MIGRATION_TABLES.map((table) => `${table}.csv.gz`),
  ];
  if (options.unexpectedFile) {
    await writeFile(join(directory, 'unexpected.txt'), 'not declared');
    files.push('unexpected.txt');
  }
  const archive = join(directory, 'migration.tar');
  await runFile('tar', ['-cf', archive, '-C', directory, ...files]);
  const contents = await readFile(archive);
  return { contents, digest: sha256(contents) };
}

const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('./download.ts', () => ({ downloadFile: mocks.download }));

afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('downloadDataMigration', () => {
  it('downloads and verifies every declared package file', async () => {
    const archive = await packageArchive();
    mocks.download.mockImplementation(async (_url: string, path: string) => {
      await writeFile(path, archive.contents);
    });

    const migration = await downloadDataMigration(
      'https://example.test/migration.tar',
      archive.digest,
    );

    expect(migration.manifest.migration_id).toBe('baseline-1');
    await migration.cleanup();
  });

  it('rejects a declared file size that does not match the archive', async () => {
    const archive = await packageArchive({ wrongBytes: true });
    mocks.download.mockImplementation(async (_url: string, path: string) => {
      await writeFile(path, archive.contents);
    });

    await expect(
      downloadDataMigration('https://example.test/migration.tar', archive.digest),
    ).rejects.toThrow('Data migration checksum failed for observation.csv.gz');
  });

  it('rejects an archive containing an undeclared file', async () => {
    const archive = await packageArchive({ unexpectedFile: true });
    mocks.download.mockImplementation(async (_url: string, path: string) => {
      await writeFile(path, archive.contents);
    });

    await expect(
      downloadDataMigration('https://example.test/migration.tar', archive.digest),
    ).rejects.toThrow('Data migration archive contains unexpected files');
  });

  it('rejects a relationship file whose size does not match the manifest', async () => {
    const archive = await packageArchive({ wrongRelationshipBytes: true });
    mocks.download.mockImplementation(async (_url: string, path: string) => {
      await writeFile(path, archive.contents);
    });
    await expect(
      downloadDataMigration('https://example.test/migration.tar', archive.digest),
    ).rejects.toThrow('Data migration checksum failed for indicator-relationships.json');
  });

  it('rejects a declared file stored as a link', async () => {
    const archive = await packageArchive({ linkedFile: true });
    mocks.download.mockImplementation(async (_url: string, path: string) => {
      await writeFile(path, archive.contents);
    });

    await expect(
      downloadDataMigration('https://example.test/migration.tar', archive.digest),
    ).rejects.toThrow('Data migration archive contains a link');
  });

  it('propagates a failed download', async () => {
    mocks.download.mockRejectedValue(new Error('download failed'));
    await expect(
      downloadDataMigration('https://example.test/migration.tar', 'a'.repeat(64)),
    ).rejects.toThrow('download failed');
  });
});
