import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

import { sha256 } from '@fphd/db-operations';

import { readGzipCsv } from './csv.ts';

/** The core data directory of `@fphd/db-operations`, which holds the geography catalog. */
export const DEFAULT_DATA_DIRECTORY = fileURLToPath(
  new URL('../../../packages/db-operations/data/', import.meta.url),
);

/** The worktree's cache of Fingertips API responses, which a refresh reads before the network. */
export const DEFAULT_CACHE_DIRECTORY = fileURLToPath(
  new URL('../../../node_modules/.cache/', import.meta.url),
);

const FINGERTIPS_API = 'https://fingertips.phe.org.uk/api';

/** Reads one Fingertips API path, such as `areas/by_area_type?area_type_id=502`, as JSON. */
export type FetchJson = (path: string) => Promise<unknown>;

export const fetchFingertipsJson: FetchJson = async (path) => {
  const response = await fetch(`${FINGERTIPS_API}/${path}`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Fingertips API answered ${response.status} for ${path}`);
  return response.json();
};

/**
 * Answers each path from a JSON file in the cache directory, named by the path's SHA-256, and
 * fetches and stores only the paths it has no file for.
 */
export function cachedFetchJson(directory: string, fetchJson: FetchJson): FetchJson {
  return async (path) => {
    const file = join(directory, `${createHash('sha256').update(path).digest('hex')}.json`);
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const data = await fetchJson(path);
    await mkdir(directory, { recursive: true });
    await writeFile(file, JSON.stringify(data));
    return data;
  };
}

/** Every value quoted and each row ended by a newline, as the committed geography files are. */
export function encodeQuotedCsv(rows: readonly (readonly (string | number)[])[]): string {
  return rows
    .map((row) => `${row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')}\n`)
    .join('');
}

/** The ids of the current areas in the committed area catalog, by area code. */
export async function currentAreaIds(geographyDirectory: string): Promise<Map<string, string[]>> {
  const ids = new Map<string, string[]>();
  let header: string[] | undefined;
  for await (const row of readGzipCsv(join(geographyDirectory, 'area.csv.gz'))) {
    if (header === undefined) {
      header = row;
      continue;
    }
    const record = Object.fromEntries(header.map((column, index) => [column, row[index]]));
    if (record.is_current !== 't' || record.code === undefined || record.id === undefined) continue;
    ids.set(record.code, [...(ids.get(record.code) ?? []), record.id]);
  }
  return ids;
}

/** Stops on any code that doesn't name exactly one current area. */
export function assertOneCurrentArea(
  codes: Iterable<string>,
  areaIds: ReadonlyMap<string, readonly string[]>,
): void {
  const missing = [...new Set(codes)].filter((code) => areaIds.get(code)?.length !== 1).sort();
  if (missing.length > 0) {
    throw new Error(`Codes without exactly one current area: ${missing.join(', ')}`);
  }
}

export interface GeographyFileEntry {
  file: string;
  source: string;
  rows: number;
  bytes: number;
  sha256: string;
}

async function readGzipText(path: string): Promise<string | undefined> {
  try {
    return gunzipSync(await readFile(path)).toString('utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Writes `<table>.csv.gz` into the geography directory and records its row count, size and
 * digest in `manifest.json`. When the file already holds exactly these rows, it is left as it is,
 * so a refresh of unchanged data writes nothing whatever zlib build compresses it. The manifest is
 * written only when the file's entry changes.
 */
export async function writeGeographyFile(
  geographyDirectory: string,
  table: string,
  source: string,
  csv: string,
  rows: number,
): Promise<GeographyFileEntry & { written: boolean }> {
  const file = `${table}.csv.gz`;
  const path = join(geographyDirectory, file);
  const written = (await readGzipText(path)) !== csv;
  if (written) {
    await writeFile(`${path}.tmp`, gzipSync(csv, { level: 9 }));
    await rename(`${path}.tmp`, path);
  }
  const entry = { file, source, rows, bytes: (await stat(path)).size, sha256: await sha256(path) };
  const manifestPath = join(geographyDirectory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (JSON.stringify(manifest.files?.[table]) !== JSON.stringify(entry)) {
    const updated = { ...manifest, files: { ...manifest.files, [table]: entry } };
    await writeFile(manifestPath, `${JSON.stringify(updated, null, 2)}\n`);
  }
  return { ...entry, written };
}
