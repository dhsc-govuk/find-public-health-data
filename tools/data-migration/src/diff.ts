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
      const idIndex = afterHeader.indexOf('id');
      if (idIndex === -1) throw new Error(`${table} has no id column`);

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
        await write(deletes, encodeRow(['id']));

        let previousOldId: string | undefined;
        let previousNewId: string | undefined;
        const nextOrdered = async (
          iterator: AsyncIterator<string[]>,
          snapshot: string,
          previousId: string | undefined,
        ): Promise<string[] | undefined> => {
          const row = await next(iterator);
          if (!row) return undefined;
          const id = row[idIndex];
          if (!id || (previousId !== undefined && id <= previousId)) {
            throw new Error(`${table} rows in the ${snapshot} snapshot are not ordered by id`);
          }
          return row;
        };
        let oldRow = await nextOrdered(before, 'previous', previousOldId);
        let newRow = await nextOrdered(after, 'current', previousNewId);
        while (oldRow !== undefined || newRow !== undefined) {
          const oldId = oldRow?.[idIndex];
          const newId = newRow?.[idIndex];
          if (
            oldRow === undefined ||
            (newId !== undefined && oldId !== undefined && newId < oldId)
          ) {
            await write(upserts, encodeRow(newRow ?? [], true));
            upsertRows += 1;
            previousNewId = newId;
            newRow = await nextOrdered(after, 'current', previousNewId);
          } else if (
            newRow === undefined ||
            (oldId !== undefined && newId !== undefined && oldId < newId)
          ) {
            if (!complete) {
              await write(deletes, encodeRow([oldId ?? ''], true));
              deleteRows += 1;
            }
            previousOldId = oldId;
            oldRow = await nextOrdered(before, 'previous', previousOldId);
          } else {
            if (
              complete ||
              (table === 'indicator_version' && referencesChanged) ||
              encodeRow(oldRow, true) !== encodeRow(newRow, true)
            ) {
              await write(upserts, encodeRow(newRow, true));
              upsertRows += 1;
            }
            previousOldId = oldId;
            previousNewId = newId;
            oldRow = await nextOrdered(before, 'previous', previousOldId);
            newRow = await nextOrdered(after, 'current', previousNewId);
          }
        }
      } catch (error) {
        // Leave no half-written gzip behind to be mistaken for a package file.
        for (const stream of [upserts, deletes, upsertDestination, deleteDestination])
          stream.destroy();
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
