import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import { DATA_MIGRATION_NULL } from '@fphd/db-operations/data-migration-contract';

import { encodeRow } from '../csv.ts';
import { fileRecord } from '../files.ts';
import type { TABLES } from '../tables.ts';
import { PHOLIO_EXPORT_COLUMNS } from './columns.ts';

export type ExportTable = (typeof TABLES)[number];
export type ExportValue = string | number | boolean | null | undefined;
export type ExportRow = Readonly<Record<string, ExportValue>>;

function cell(value: ExportValue): string | number {
  if (value === null || value === undefined) return DATA_MIGRATION_NULL;
  if (typeof value === 'boolean') return value ? 't' : 'f';
  return value;
}

/**
 * Writes one export table as gzipped CSV in the columns export-pholio writes. Rows must arrive in
 * ascending id order: rekeying keeps that order and the incremental diff depends on it.
 */
export class TableWriter {
  readonly #table: ExportTable;
  readonly #path: string;
  readonly #columns: readonly string[];
  readonly #gzip = createGzip({ level: 1 });
  readonly #written: Promise<void>;
  #rows = 0;
  #lastId = 0;
  #closed = false;

  constructor(directory: string, table: ExportTable) {
    this.#table = table;
    this.#path = join(directory, `${table}.csv.gz`);
    this.#columns = PHOLIO_EXPORT_COLUMNS[table];
    this.#written = finished(this.#gzip.pipe(createWriteStream(this.#path)));
    this.#gzip.write(`${this.#columns.join(',')}\r\n`);
  }

  async write(row: ExportRow): Promise<void> {
    const id = row.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= this.#lastId) {
      throw new Error(
        `${this.#table} row id ${String(id)} is not above the previous ${this.#lastId}`,
      );
    }
    // Every row of a table is built by the same code, so checking the first one is enough.
    if (this.#rows === 0) {
      const unknown = Object.keys(row).filter((column) => !this.#columns.includes(column));
      if (unknown.length > 0) {
        throw new Error(`${this.#table} has no export column ${unknown.join(', ')}`);
      }
    }
    this.#lastId = id;
    this.#rows += 1;
    if (!this.#gzip.write(encodeRow(this.#columns.map((column) => cell(row[column]))))) {
      await once(this.#gzip, 'drain');
    }
  }

  async writeAll(rows: Iterable<ExportRow>): Promise<void> {
    for (const row of [...rows].sort((a, b) => Number(a.id) - Number(b.id))) await this.write(row);
  }

  async close() {
    this.#closed = true;
    this.#gzip.end();
    await this.#written;
    return fileRecord(this.#path, `${this.#table}.csv.gz`, this.#rows);
  }

  /**
   * Ends a writer that its stage never closed, which happens when the stage throws. It waits for
   * the file to finish writing, so the stage's error reaches the caller only after the file is
   * closed. A write error here is ignored because the stage's own error is the one to report.
   */
  async [Symbol.asyncDispose]() {
    if (this.#closed) return;
    this.#closed = true;
    this.#gzip.end();
    await this.#written.catch(() => undefined);
  }
}
