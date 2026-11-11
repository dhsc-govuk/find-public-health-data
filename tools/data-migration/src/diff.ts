import { once } from 'node:events';
import { createWriteStream, type WriteStream } from 'node:fs';
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { createGzip, type Gzip } from 'node:zlib';

import {
  baselineManifestSchema,
  DATA_MIGRATION_FORMAT_VERSION,
  DATA_MIGRATION_NULL,
  DATA_MIGRATION_REFERENCE_TABLES,
  DATA_MIGRATION_SCHEMA,
  dataMigrationKey,
  type IncrementalManifest,
  incrementalManifestSchema,
} from '@fphd/db-operations/data-migration-contract';

import { encodeRow, readGzipCsv } from './csv.ts';
import { fileRecord } from './files.ts';
import { writePreparedDirectory } from './prepared-directory.ts';
import { TABLES } from './tables.ts';
import { verifyPackageFiles } from './verify.ts';

const VERSION_REFERENCE_TABLES = ['ci_method', 'comparator_method', 'numerator_denominator_source'];

async function write(stream: Gzip, value: string): Promise<void> {
  if (!stream.write(value)) await once(stream, 'drain');
}

async function finish(stream: Gzip, destination: WriteStream): Promise<void> {
  stream.end();
  await finished(destination);
}

async function next(iterator: AsyncIterator<string[]>): Promise<string[] | undefined> {
  const result = await iterator.next();
  return result.done ? undefined : result.value;
}

// Key values are UUIDs, which sort as text in the order the rekeyed rows were written.
function compareKeys(left: readonly string[], right: readonly string[]): number {
  for (const [index, value] of left.entries()) {
    const other = right[index] ?? '';
    if (value !== other) return value < other ? -1 : 1;
  }
  return 0;
}

export async function createIncremental(
  previousDirectory: string,
  currentDirectory: string,
  outDirectory: string,
  migrationId: string,
): Promise<void> {
  const previous = baselineManifestSchema.parse(
    JSON.parse(await readFile(join(previousDirectory, 'manifest.json'), 'utf8')),
  );
  const current = baselineManifestSchema.parse(
    JSON.parse(await readFile(join(currentDirectory, 'manifest.json'), 'utf8')),
  );
  await verifyPackageFiles(previousDirectory, previous);
  await verifyPackageFiles(currentDirectory, current);
  if (current.migration_id !== migrationId) {
    throw new Error('The incremental migration ID must match its prepared target snapshot');
  }
  if (current.source.database !== previous.source.database) {
    throw new Error('Incremental snapshots must come from the same source database');
  }
  if (new Date(current.source.cutoff_at) <= new Date(previous.source.cutoff_at)) {
    throw new Error('The incremental target cutoff must be newer than its predecessor');
  }
  await writePreparedDirectory(outDirectory, async (staged) => {
    await copyFile(
      join(currentDirectory, current.relationships.file),
      join(staged, current.relationships.file),
    );

    const referencesChanged = VERSION_REFERENCE_TABLES.some(
      (table) => previous.tables[table]?.sha256 !== current.tables[table]?.sha256,
    );
    const tables: IncrementalManifest['tables'] = {};
    for (const table of TABLES) {
      const complete = DATA_MIGRATION_REFERENCE_TABLES.includes(table);
      const before = readGzipCsv(join(previousDirectory, `${table}.csv.gz`))[
        Symbol.asyncIterator
      ]();
      const after = readGzipCsv(join(currentDirectory, `${table}.csv.gz`))[Symbol.asyncIterator]();
      const beforeHeader = await next(before);
      const afterHeader = await next(after);
      if (!beforeHeader || !afterHeader || beforeHeader.join(',') !== afterHeader.join(',')) {
        throw new Error(`${table} columns differ between snapshots`);
      }
      const keyColumns = dataMigrationKey(table);
      const keyIndexes = keyColumns.map((column) => afterHeader.indexOf(column));
      if (keyIndexes.includes(-1)) {
        throw new Error(`${table} is missing its key columns: ${keyColumns.join(', ')}`);
      }
      const keyOf = (row: string[]) => keyIndexes.map((index) => row[index] ?? '');

      const upsertFile = `${table}.csv.gz`;
      const deleteFile = `${table}.deletes.csv.gz`;
      const upsertPath = join(staged, upsertFile);
      const deletePath = join(staged, deleteFile);
      const upserts = createGzip({ level: 1 });
      const deletes = createGzip({ level: 1 });
      const upsertDestination = createWriteStream(upsertPath);
      const deleteDestination = createWriteStream(deletePath);
      upserts.pipe(upsertDestination);
      deletes.pipe(deleteDestination);
      let upsertRows = 0;
      let deleteRows = 0;
      try {
        await write(upserts, encodeRow(afterHeader));
        await write(deletes, encodeRow([...keyColumns]));

        const nextOrdered = async (
          iterator: AsyncIterator<string[]>,
          snapshot: string,
          previous: string[] | undefined,
        ): Promise<string[] | undefined> => {
          const row = await next(iterator);
          if (!row) return undefined;
          const key = keyOf(row);
          if (key.includes('') || (previous !== undefined && compareKeys(key, previous) <= 0)) {
            throw new Error(
              `${table} rows in the ${snapshot} snapshot are not ordered by ${keyColumns.join(', ')}`,
            );
          }
          return row;
        };
        let oldRow = await nextOrdered(before, 'previous', undefined);
        let newRow = await nextOrdered(after, 'current', undefined);
        while (oldRow !== undefined || newRow !== undefined) {
          if (
            oldRow === undefined ||
            (newRow !== undefined && compareKeys(keyOf(newRow), keyOf(oldRow)) < 0)
          ) {
            await write(upserts, encodeRow(newRow ?? [], true));
            upsertRows += 1;
            newRow = await nextOrdered(after, 'current', newRow && keyOf(newRow));
          } else if (newRow === undefined || compareKeys(keyOf(oldRow), keyOf(newRow)) < 0) {
            if (!complete) {
              await write(deletes, encodeRow(keyOf(oldRow), true));
              deleteRows += 1;
            }
            oldRow = await nextOrdered(before, 'previous', keyOf(oldRow));
          } else {
            if (
              complete ||
              (table === 'indicator_version' && referencesChanged) ||
              encodeRow(oldRow, true) !== encodeRow(newRow, true)
            ) {
              await write(upserts, encodeRow(newRow, true));
              upsertRows += 1;
            }
            oldRow = await nextOrdered(before, 'previous', keyOf(oldRow));
            newRow = await nextOrdered(after, 'current', keyOf(newRow));
          }
        }
      } catch (error) {
        // Leave no half-written gzip behind to be mistaken for a package file. The streams are
        // ended and waited for before the files go, not destroyed: a file stream destroyed with a
        // write in flight fails that write when it completes, and nothing is listening by then.
        // A write error here is ignored in favour of the error being thrown.
        await Promise.all(
          [finish(upserts, upsertDestination), finish(deletes, deleteDestination)].map((closing) =>
            closing.catch(() => undefined),
          ),
        );
        await Promise.all([rm(upsertPath, { force: true }), rm(deletePath, { force: true })]);
        throw error;
      }
      await Promise.all([finish(upserts, upsertDestination), finish(deletes, deleteDestination)]);
      tables[table] = {
        upserts: await fileRecord(upsertPath, upsertFile, upsertRows),
        deletes: await fileRecord(deletePath, deleteFile, deleteRows),
      };
      console.log(
        `${table}: ${upsertRows.toLocaleString()} upserts, ${deleteRows.toLocaleString()} deletes`,
      );
    }

    const manifest = incrementalManifestSchema.parse({
      format_version: DATA_MIGRATION_FORMAT_VERSION,
      schema: DATA_MIGRATION_SCHEMA,
      migration_id: migrationId,
      kind: 'incremental',
      predecessor: previous.migration_id,
      relationships: current.relationships,
      source: current.source,
      source_csv_null: DATA_MIGRATION_NULL,
      id_mapping: 'deterministic-uuidv7-v1',
      tables,
    });
    await writeFile(join(staged, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  });
}
