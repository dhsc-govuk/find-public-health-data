import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { promisify } from 'node:util';

import { sha256 } from '@fphd/db-operations';
import { dataMigrationManifestSchema } from '@fphd/db-operations/data-migration-contract';

import { verifyPackageFiles } from './verify.ts';

const runFile = promisify(execFile);

export async function createArchive(directory: string, output: string): Promise<void> {
  const manifest = dataMigrationManifestSchema.parse(
    JSON.parse(await readFile(`${directory}/manifest.json`, 'utf8')),
  );
  await verifyPackageFiles(directory, manifest);
  const files = new Set<string>(['manifest.json']);
  files.add(manifest.relationships.file);
  for (const table of Object.values(manifest.tables)) {
    if ('file' in table) files.add(table.file);
    else {
      files.add(table.upserts.file);
      files.add(table.deletes.file);
    }
  }
  await runFile('tar', ['-cf', output, '-C', directory, ...[...files].sort()]);
  const digest = await sha256(output);
  await writeFile(`${output}.sha256`, `${digest}  ${basename(output)}\n`);
  console.log(`${output}: ${digest}`);
  console.log(`Upload the archive from ${dirname(output)} to private migration storage.`);
}
