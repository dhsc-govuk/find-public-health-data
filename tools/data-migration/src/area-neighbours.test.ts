import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { sha256 } from '@fphd/db-operations';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AREA_NEIGHBOUR_TAG,
  areaNeighbourCsv,
  areaNeighbourId,
  exportAreaNeighbours,
  neighbourRows,
} from './area-neighbours.ts';
import { readGzipCsv } from './csv.ts';
import { DEFAULT_DATA_DIRECTORY, type FetchJson } from './geography-files.ts';
import { TABLE_TAGS } from './tables.ts';

const GEOGRAPHY = join(DEFAULT_DATA_DIRECTORY, 'geography');
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** Answers each path from the map, failing on a path the test didn't expect. */
function respond(responses: Record<string, unknown>): FetchJson {
  return async (path) => {
    if (!(path in responses)) throw new Error(`Unexpected request: ${path}`);
    return responses[path];
  };
}

function council(code: string, groups: unknown[]): Record<string, unknown> {
  return {
    'areas/by_area_type?area_type_id=502': [{ Code: code }],
    [`areas/nearest_neighbours?area_type_id=502&area_code=${code}`]: { NeighbourAreaDet: groups },
  };
}

function ranked(count: number, start = 2): { AreaCode: string; Position: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    AreaCode: `E060000${String(index + start).padStart(2, '0')}`,
    Position: index + 1,
  }));
}

async function readRows(path: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  let header: string[] | undefined;
  for await (const row of readGzipCsv(path)) {
    if (header === undefined) header = row;
    else rows.push(Object.fromEntries(header.map((column, index) => [column, row[index] ?? ''])));
  }
  return rows;
}

describe('areaNeighbourId', () => {
  it('follows the natural key independently of other rows', () => {
    const first = areaNeighbourId('E06000001', 1);
    areaNeighbourId('E06000000', 1);

    expect(areaNeighbourId('E06000001', 1)).toBe(first);
    expect(areaNeighbourId('E06000001', 2)).not.toBe(first);
    expect(areaNeighbourId('E06000002', 1)).not.toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('uses a tag no rekeyed table uses', () => {
    expect(Object.values(TABLE_TAGS)).not.toContain(AREA_NEIGHBOUR_TAG);
    expect(AREA_NEIGHBOUR_TAG).toBeGreaterThan(Math.max(...Object.values(TABLE_TAGS)));
  });

  it('gives every committed neighbour the id the file holds', async () => {
    const codes = new Map(
      (await readRows(join(GEOGRAPHY, 'area.csv.gz'))).map(({ id, code }) => [id, code]),
    );
    const neighbours = await readRows(join(GEOGRAPHY, 'area_neighbour.csv.gz'));

    expect(neighbours.length).toBeGreaterThan(0);
    for (const { id, area_id, position } of neighbours) {
      expect(areaNeighbourId(codes.get(area_id) ?? '', Number(position))).toBe(id);
    }
  });
});

describe('neighbourRows', () => {
  it('stops with the council code when its peer group is missing', async () => {
    await expect(neighbourRows(respond(council('E06000001', [])))).rejects.toThrow(
      'neighbour-type-15 group for E06000001',
    );
  });

  it('stops on an incomplete ranking instead of writing part of the export', async () => {
    const group = { NeighbourTypeId: 15, NeighbourAreas: ranked(1) };

    await expect(neighbourRows(respond(council('E06000001', [group])))).rejects.toThrow(
      '15 ranked neighbours for E06000001',
    );
  });

  it('stops on a gap in the ranking', async () => {
    const neighbours = ranked(15).map((neighbour) =>
      neighbour.Position === 15 ? { ...neighbour, Position: 16 } : neighbour,
    );
    const group = { NeighbourTypeId: 15, NeighbourAreas: neighbours };

    await expect(neighbourRows(respond(council('E06000001', [group])))).rejects.toThrow(
      '15 ranked neighbours for E06000001',
    );
  });

  it('keeps only neighbour type 15, in position order', async () => {
    const neighbours = ranked(15);
    const groups = [
      { NeighbourTypeId: 99, NeighbourAreas: [] },
      { NeighbourTypeId: 15, NeighbourAreas: [...neighbours].reverse() },
    ];

    expect(await neighbourRows(respond(council('E06000001', groups)))).toEqual(
      neighbours.map(({ AreaCode, Position }) => ({
        code: 'E06000001',
        neighbourCode: AreaCode,
        position: Position,
      })),
    );
  });

  it('ignores another neighbour type whatever its neighbours look like', async () => {
    const neighbours = ranked(15);
    const groups = [
      { NeighbourTypeId: 1, NeighbourAreas: null },
      { NeighbourTypeId: 15, NeighbourAreas: neighbours },
    ];

    expect(await neighbourRows(respond(council('E06000001', groups)))).toHaveLength(15);
  });

  it('stops when a council is its own neighbour', async () => {
    const group = { NeighbourTypeId: 15, NeighbourAreas: ranked(15, 1) };

    await expect(neighbourRows(respond(council('E06000001', [group])))).rejects.toThrow(
      /own neighbour.*E06000001/,
    );
  });

  it('stops when Fingertips lists a council more than once', async () => {
    const responses = {
      'areas/by_area_type?area_type_id=502': [
        { Code: 'E06000001' },
        { Code: 'E06000002' },
        { Code: 'E06000001' },
      ],
    };

    await expect(neighbourRows(respond(responses))).rejects.toThrow(
      'Fingertips lists these councils more than once: E06000001',
    );
  });

  it('stops when Fingertips returns no councils', async () => {
    await expect(
      neighbourRows(respond({ 'areas/by_area_type?area_type_id=502': [] })),
    ).rejects.toThrow('No upper tier local authorities returned');
  });
});

describe('areaNeighbourCsv', () => {
  it('stops on a code without exactly one current area', () => {
    const areaIds = new Map([
      ['E06000001', ['a']],
      ['E06000002', ['b', 'c']],
    ]);

    expect(() =>
      areaNeighbourCsv(
        [
          { code: 'E06000001', neighbourCode: 'E06000002', position: 1 },
          { code: 'E06000001', neighbourCode: 'E06000003', position: 2 },
        ],
        areaIds,
      ),
    ).toThrow('Codes without exactly one current area: E06000002, E06000003');
  });
});

describe('exportAreaNeighbours', () => {
  /** The Fingertips answers that hold the committed rankings, councils and neighbours shuffled. */
  async function committedResponses(): Promise<Record<string, unknown>> {
    const codes = new Map(
      (await readRows(join(GEOGRAPHY, 'area.csv.gz')))
        .filter(({ is_current }) => is_current === 't')
        .map(({ id, code }) => [id, code]),
    );
    const groups = new Map<string, { AreaCode: string; Position: number }[]>();
    for (const row of await readRows(join(GEOGRAPHY, 'area_neighbour.csv.gz'))) {
      const code = codes.get(row.area_id ?? '') ?? '';
      groups.set(code, [
        { AreaCode: codes.get(row.neighbour_area_id ?? '') ?? '', Position: Number(row.position) },
        ...(groups.get(code) ?? []),
      ]);
    }
    return Object.fromEntries([
      [
        'areas/by_area_type?area_type_id=502',
        [...groups.keys()].reverse().map((code) => ({ Code: code })),
      ],
      ...[...groups].map(([code, neighbours]) => [
        `areas/nearest_neighbours?area_type_id=502&area_code=${code}`,
        { NeighbourAreaDet: [{ NeighbourTypeId: 15, NeighbourAreas: neighbours }] },
      ]),
    ]);
  }

  /** A data directory holding copies of the named committed geography files. */
  async function geographyCopy(files: readonly string[]): Promise<string> {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'area-neighbours-'));
    directories.push(dataDirectory);
    await mkdir(join(dataDirectory, 'geography'));
    for (const file of files) {
      await copyFile(join(GEOGRAPHY, file), join(dataDirectory, 'geography', file));
    }
    return dataDirectory;
  }

  it('leaves the committed file and manifest byte-identical when the rows are unchanged', async () => {
    const dataDirectory = await geographyCopy([
      'area.csv.gz',
      'area_neighbour.csv.gz',
      'manifest.json',
    ]);

    const entry = await exportAreaNeighbours(dataDirectory, respond(await committedResponses()));

    for (const file of ['area_neighbour.csv.gz', 'manifest.json']) {
      expect(await readFile(join(dataDirectory, 'geography', file))).toEqual(
        await readFile(join(GEOGRAPHY, file)),
      );
    }
    expect(entry).toMatchObject({ written: false, areas: 151, rows: 2265 });
  });

  it('writes the committed rows from the same rankings and records them in the manifest', async () => {
    const dataDirectory = await geographyCopy(['area.csv.gz', 'manifest.json']);
    const geography = join(dataDirectory, 'geography');
    const fetchJson = respond(await committedResponses());

    const entry = await exportAreaNeighbours(dataDirectory, fetchJson);
    const written = await readFile(join(geography, 'area_neighbour.csv.gz'));
    const committed = await readFile(join(GEOGRAPHY, 'area_neighbour.csv.gz'));
    const before = JSON.parse(await readFile(join(GEOGRAPHY, 'manifest.json'), 'utf8'));
    const manifest = await readFile(join(geography, 'manifest.json'));
    const after = JSON.parse(manifest.toString('utf8'));

    expect(gunzipSync(written).toString()).toBe(gunzipSync(committed).toString());
    expect(entry).toMatchObject({
      written: true,
      areas: 151,
      rows: before.files.area_neighbour.rows,
    });
    expect(after.files.area_neighbour).toEqual({
      ...before.files.area_neighbour,
      bytes: written.length,
      sha256: await sha256(join(geography, 'area_neighbour.csv.gz')),
    });
    expect({ ...after.files, area_neighbour: undefined }).toEqual({
      ...before.files,
      area_neighbour: undefined,
    });

    expect(await exportAreaNeighbours(dataDirectory, fetchJson)).toMatchObject({ written: false });
    expect(await readFile(join(geography, 'area_neighbour.csv.gz'))).toEqual(written);
    expect(await readFile(join(geography, 'manifest.json'))).toEqual(manifest);
  });
});
