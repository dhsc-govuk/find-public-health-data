import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  assertCompleteTableSet,
  assertMigrationFileNames,
  type DataMigrationManifest,
  dataMigrationManifestSchema,
  sha256,
} from '@fphd/db-operations';

import { type DownloadResume, downloadFile } from './download.ts';

const runFile = promisify(execFile);

async function assertRegularFile(path: string): Promise<void> {
  if (!(await lstat(path)).isFile()) throw new Error('Data migration archive contains a link');
}

async function verifyFiles(
  directory: string,
  manifest: DataMigrationManifest,
): Promise<Set<string>> {
  const expected = new Set(['manifest.json']);
  const entries = [
    ...Object.values(manifest.tables).flatMap((table) =>
      'file' in table ? [table] : [table.upserts, table.deletes],
    ),
    manifest.relationships,
  ];
  for (const entry of entries) {
    expected.add(entry.file);
    const path = join(directory, entry.file);
    if ((await stat(path)).size !== entry.bytes || (await sha256(path)) !== entry.sha256) {
      throw new Error(`Data migration checksum failed for ${entry.file}`);
    }
  }
  return expected;
}

export async function downloadDataMigration(
  url: string,
  expectedSha256: string,
  onResume?: (resume: DownloadResume) => void,
): Promise<{
  directory: string;
  manifest: DataMigrationManifest;
  cleanup: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'fphd-data-migration-'));
  try {
    const archive = join(directory, 'migration.tar');
    await downloadFile(url, archive, 'Data migration', { onResume });
    if ((await sha256(archive)) !== expectedSha256) {
      throw new Error('Data migration archive checksum failed');
    }
    const { stdout } = await runFile('tar', ['-tf', archive]);
    const archived = stdout.trim().split('\n');
    if (!archived.includes('manifest.json'))
      throw new Error('Data migration archive has no manifest');
    await runFile('tar', ['-xf', archive, '-C', directory, 'manifest.json']);
    await assertRegularFile(join(directory, 'manifest.json'));
    const manifest = dataMigrationManifestSchema.parse(
      JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')),
    );
    const expected = await verifyFilesAfterExtraction(archive, directory, manifest);
    if (archived.length !== expected.size || archived.some((file) => !expected.has(file))) {
      throw new Error('Data migration archive contains unexpected files');
    }
    await rm(archive);
    return { directory, manifest, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function verifyFilesAfterExtraction(
  archive: string,
  directory: string,
  manifest: DataMigrationManifest,
): Promise<Set<string>> {
  assertCompleteTableSet(manifest.tables);
  assertMigrationFileNames(manifest);
  const files = Object.values(manifest.tables).flatMap((table) =>
    'file' in table ? [table.file] : [table.upserts.file, table.deletes.file],
  );
  files.push(manifest.relationships.file);
  await runFile('tar', ['-xf', archive, '-C', directory, ...files]);
  for (const file of files) await assertRegularFile(join(directory, file));
  return verifyFiles(directory, manifest);
}
