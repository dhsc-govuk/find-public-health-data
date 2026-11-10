import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { readGzipCsv } from '../csv.ts';
import { TableWriter } from './table-writer.ts';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function writer(table: 'observation_note' | 'note_type') {
  const directory = await mkdtemp(join(tmpdir(), 'fphd-table-writer-'));
  directories.push(directory);
  return { directory, writer: new TableWriter(directory, table) };
}

it('writes bridge rows in order of observation, then note type', async () => {
  const { directory, writer: notes } = await writer('observation_note');
  await notes.writeAll([
    { observation_id: 4, note_type_id: 1 },
    { observation_id: 2, note_type_id: 9 },
    { observation_id: 2, note_type_id: 3 },
  ]);
  await notes.close();

  const rows: string[][] = [];
  for await (const row of readGzipCsv(join(directory, 'observation_note.csv.gz'))) rows.push(row);
  expect(rows).toEqual([
    ['observation_id', 'note_type_id'],
    ['2', '3'],
    ['2', '9'],
    ['4', '1'],
  ]);
});

it('refuses a bridge row that is not above the previous one', async () => {
  const { writer: notes } = await writer('observation_note');
  await notes.write({ observation_id: 2, note_type_id: 9 });

  await expect(notes.write({ observation_id: 2, note_type_id: 3 })).rejects.toThrow(
    'observation_note row observation_id, note_type_id 2, 3 is not above the previous 2, 9',
  );
  await notes[Symbol.asyncDispose]();
});

it('refuses a row keyed by anything but positive integers', async () => {
  const { writer: types } = await writer('note_type');

  await expect(types.write({ id: 0, text: 'Note', category: 'quality' })).rejects.toThrow(
    'note_type row id 0 is not keyed by positive integers',
  );
  await types[Symbol.asyncDispose]();
});
