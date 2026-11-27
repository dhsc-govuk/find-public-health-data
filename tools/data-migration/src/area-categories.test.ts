import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { sha256 } from '@fphd/db-operations';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  areaCategoryCsv,
  categoryRows,
  type DimensionTypes,
  type DimensionValues,
  exportAreaCategories,
} from './area-categories.ts';
import { readGzipCsv } from './csv.ts';
import { cachedFetchJson, DEFAULT_DATA_DIRECTORY, type FetchJson } from './geography-files.ts';

const GEOGRAPHY = join(DEFAULT_DATA_DIRECTORY, 'geography');
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'area-categories-'));
  directories.push(directory);
  return directory;
}

async function catalogs(): Promise<{ types: DimensionTypes; values: DimensionValues }> {
  const read = async (file: string) =>
    JSON.parse(await readFile(join(DEFAULT_DATA_DIRECTORY, file), 'utf8'));
  return { types: await read('dimension-types.json'), values: await read('dimension-values.json') };
}

/** Answers the four category requests in order, as Fingertips is asked for them. */
function answers(...responses: unknown[]): FetchJson {
  const remaining = [...responses];
  return async () => remaining.shift();
}

const CATEGORY_PATHS = {
  'County & UA deprivation deciles in England (IMD2025, 4/23 geography)':
    'area_categories?profile_id=19&child_area_type_id=502&category_type_id=170',
  'County & UA deprivation deciles in England (IMD2019, 4/23 geography)':
    'area_categories?profile_id=19&child_area_type_id=502&category_type_id=160',
  'District & UA deprivation deciles in England (IMD2025, 4/23 geography)':
    'area_categories?profile_id=19&child_area_type_id=501&category_type_id=173',
  'District & UA deprivation deciles in England (IMD2019, 4/23 geography)':
    'area_categories?profile_id=19&child_area_type_id=501&category_type_id=163',
} as const;

describe('categoryRows', () => {
  it('resolves each scheme and tier by dimension type and decile code', async () => {
    const { types, values } = await catalogs();

    const rows = await categoryRows(
      answers({ E10000032: 9 }, { E06000052: 5 }, { E06000052: 6 }, { E06000052: 5 }),
      types,
      values,
    );

    const typeNames = new Map(types.map(({ id, name }) => [id, name]));
    const resolved = rows.map(({ areaCode, dimensionValueId }) => {
      const value = values.find(({ id }) => id === dimensionValueId);
      return [areaCode, typeNames.get(value?.dimensionTypeId ?? ''), value?.code];
    });
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map(({ dimensionValueId }) => dimensionValueId)).size).toBe(4);
    expect(resolved).toContainEqual([
      'E10000032',
      'County & UA deprivation deciles in England (IMD2025, 4/23 geography)',
      '9',
    ]);
    expect(resolved).toContainEqual([
      'E06000052',
      'District & UA deprivation deciles in England (IMD2019, 4/23 geography)',
      '5',
    ]);
    expect(rows.map(({ areaCode }) => areaCode)).toEqual([
      'E06000052',
      'E06000052',
      'E06000052',
      'E10000032',
    ]);
  });

  it.each([{}, [], null])(
    'stops instead of writing part of the export when Fingertips returns %j',
    async (response) => {
      const { types, values } = await catalogs();

      await expect(categoryRows(answers(response), types, values)).rejects.toThrow(
        'No area categories',
      );
    },
  );

  it.each([0, 11, '9', 9.5, true, null])('rejects the decile %j', async (decile) => {
    const { types, values } = await catalogs();

    await expect(categoryRows(answers({ E10000032: decile }), types, values)).rejects.toThrow(
      'Invalid decile for E10000032',
    );
  });

  it('stops when a deprivation dimension type is missing from the catalog', async () => {
    const { types, values } = await catalogs();

    await expect(
      categoryRows(
        answers({ E10000032: 9 }),
        types.filter(({ name }) => !name.startsWith('County & UA')),
        values,
      ),
    ).rejects.toThrow('Expected one dimension type for County & UA');
  });
});

describe('areaCategoryCsv', () => {
  it('stops on a code without exactly one current area', () => {
    expect(() =>
      areaCategoryCsv([{ areaCode: 'E10000032', dimensionValueId: 'v' }], new Map()),
    ).toThrow('Codes without exactly one current area: E10000032');
  });
});

describe('cachedFetchJson', () => {
  it('answers a cached path without fetching it', async () => {
    const directory = await temporaryDirectory();
    const fetchJson = vi.fn<FetchJson>();
    const cached = cachedFetchJson(directory, fetchJson);
    const path = 'area_categories?profile_id=19';
    await writeFile(
      join(directory, `${createHash('sha256').update(path).digest('hex')}.json`),
      '{"E10000032": 9}',
    );

    expect(await cached(path)).toEqual({ E10000032: 9 });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('fetches an uncached path once and answers it from the cache after', async () => {
    const directory = await temporaryDirectory();
    const fetchJson = vi.fn<FetchJson>(async () => ({ E10000032: 9 }));
    const cached = cachedFetchJson(join(directory, 'new'), fetchJson);

    expect(await cached('area_categories?profile_id=19')).toEqual({ E10000032: 9 });
    expect(await cached('area_categories?profile_id=19')).toEqual({ E10000032: 9 });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });
});

describe('exportAreaCategories', () => {
  /** The Fingertips answers that hold the committed memberships, keyed by request path. */
  async function committedResponses(): Promise<Record<string, Record<string, number>>> {
    const { types, values } = await catalogs();
    const typeNames = new Map(types.map(({ id, name }) => [id, name]));
    const valuesById = new Map(values.map((value) => [value.id, value]));
    const responses: Record<string, Record<string, number>> = {};
    let header: string[] | undefined;
    for await (const row of readGzipCsv(join(GEOGRAPHY, 'area_category.csv.gz'))) {
      if (header === undefined) {
        header = row;
        continue;
      }
      const [areaCode = '', dimensionValueId = ''] = row;
      const value = valuesById.get(dimensionValueId);
      const name = typeNames.get(value?.dimensionTypeId ?? '') as keyof typeof CATEGORY_PATHS;
      const path = CATEGORY_PATHS[name];
      responses[path] = { [areaCode]: Number(value?.code), ...responses[path] };
    }
    return responses;
  }

  /** A data directory holding the dimension catalogs and copies of the named geography files. */
  async function geographyCopy(files: readonly string[]): Promise<string> {
    const dataDirectory = await temporaryDirectory();
    await mkdir(join(dataDirectory, 'geography'));
    for (const file of ['dimension-types.json', 'dimension-values.json']) {
      await copyFile(join(DEFAULT_DATA_DIRECTORY, file), join(dataDirectory, file));
    }
    for (const file of files) {
      await copyFile(join(GEOGRAPHY, file), join(dataDirectory, 'geography', file));
    }
    return dataDirectory;
  }

  async function committedFetch(): Promise<FetchJson> {
    const responses = await committedResponses();
    expect(Object.keys(responses)).toHaveLength(4);
    return async (path) => {
      if (!(path in responses)) throw new Error(`Unexpected request: ${path}`);
      return responses[path];
    };
  }

  it('leaves the committed file and manifest byte-identical when the rows are unchanged', async () => {
    const dataDirectory = await geographyCopy([
      'area.csv.gz',
      'area_category.csv.gz',
      'manifest.json',
    ]);

    const entry = await exportAreaCategories(dataDirectory, await committedFetch());

    for (const file of ['area_category.csv.gz', 'manifest.json']) {
      expect(await readFile(join(dataDirectory, 'geography', file))).toEqual(
        await readFile(join(GEOGRAPHY, file)),
      );
    }
    expect(entry).toMatchObject({ written: false, rows: 898 });
  });

  it('writes the committed rows from the same memberships and records them in the manifest', async () => {
    const dataDirectory = await geographyCopy(['area.csv.gz', 'manifest.json']);
    const geography = join(dataDirectory, 'geography');
    const fetchJson = await committedFetch();

    const entry = await exportAreaCategories(dataDirectory, fetchJson);
    const written = await readFile(join(geography, 'area_category.csv.gz'));
    const committed = await readFile(join(GEOGRAPHY, 'area_category.csv.gz'));
    const before = JSON.parse(await readFile(join(GEOGRAPHY, 'manifest.json'), 'utf8'));
    const manifest = await readFile(join(geography, 'manifest.json'));
    const after = JSON.parse(manifest.toString('utf8'));

    expect(gunzipSync(written).toString()).toBe(gunzipSync(committed).toString());
    expect(entry).toMatchObject({ written: true, rows: before.files.area_category.rows });
    expect(after.files.area_category).toEqual({
      ...before.files.area_category,
      bytes: written.length,
      sha256: await sha256(join(geography, 'area_category.csv.gz')),
    });
    expect({ ...after.files, area_category: undefined }).toEqual({
      ...before.files,
      area_category: undefined,
    });

    expect(await exportAreaCategories(dataDirectory, fetchJson)).toMatchObject({ written: false });
    expect(await readFile(join(geography, 'area_category.csv.gz'))).toEqual(written);
    expect(await readFile(join(geography, 'manifest.json'))).toEqual(manifest);
  });
});
