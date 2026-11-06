import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { tidyName } from '@fphd/utils/tidy-name';

import { readGzipCsv, transformGzipCsv } from './csv.ts';
import { fileRecord } from './files.ts';

const nameColumns = {
  dimension_type: 'name',
  dimension_value: 'name',
  note_type: 'text',
} as const;

/** Refuses ambiguous names before rewriting any reference table. */
export async function tidyReferenceTables(directory: string) {
  const noteAliases = new Map<string, string>();
  for (const [table, column] of Object.entries(nameColumns)) {
    let header: string[] | undefined;
    const names = new Map<string, { id: string; row: string[] }>();
    for await (const row of readGzipCsv(join(directory, `${table}.csv.gz`))) {
      if (!header) {
        header = row;
        continue;
      }
      const index = header.indexOf(column);
      if (index === -1) throw new Error(`${table} has no ${column} column`);
      const name = tidyName(row[index] ?? '');
      const idIndex = header.indexOf('id');
      const id = row[idIndex] ?? '';
      const normalised = row.map((value, position) => (position === index ? name : value));
      const scope = table === 'dimension_value' ? row[header.indexOf('dimension_type_id')] : '';
      const key = JSON.stringify([scope, name]);
      const previous = names.get(key);
      if (previous !== undefined) {
        if (
          table === 'note_type' &&
          id !== previous.id &&
          normalised.length === previous.row.length &&
          normalised.every(
            (value, position) => position === idIndex || value === previous.row[position],
          )
        ) {
          // Source rows are ordered by id, so the first equivalent note is canonical.
          noteAliases.set(id, previous.id);
          continue;
        }
        throw new Error(
          `${table} ids ${previous.id}, ${id} have the same tidied ${column}: ${JSON.stringify(name)}; resolve the source names before preparing`,
        );
      }
      names.set(key, { id, row: normalised });
    }
  }
  const tables: Record<string, Awaited<ReturnType<typeof fileRecord>>> = {};
  for (const [table, column] of Object.entries(nameColumns)) {
    const file = `${table}.csv.gz`;
    const rows = await transformGzipCsv(join(directory, file), (row, header) => {
      if (table === 'note_type' && noteAliases.has(row[header.indexOf('id')] ?? ''))
        return undefined;
      return row.map((value, index) => (header[index] === column ? tidyName(value) : value));
    });
    tables[table] = await fileRecord(join(directory, file), file, rows);
  }
  return { tables, noteAliases };
}

export async function tidyReferenceNames(directory: string): Promise<void> {
  const path = join(directory, 'source-manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  const { tables, noteAliases } = await tidyReferenceTables(directory);
  Object.assign(manifest.tables, tables);
  if (noteAliases.size > 0) {
    const file = 'observation_note.csv.gz';
    const rows = await transformGzipCsv(join(directory, file), (row, header) =>
      row.map((value, index) =>
        header[index] === 'note_type_id' ? (noteAliases.get(value) ?? value) : value,
      ),
    );
    if (rows !== manifest.tables.observation_note.rows)
      throw new Error('Observation note row count changed while resolving equivalent note types');
    manifest.tables.observation_note = await fileRecord(join(directory, file), file, rows);
    manifest.reference_name_aliases = {
      ...manifest.reference_name_aliases,
      note_type: {
        ...manifest.reference_name_aliases?.note_type,
        ...Object.fromEntries(noteAliases),
      },
    };
  }
  manifest.reference_names = 'tidied';
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
