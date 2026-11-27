import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { z } from '@fphd/config';

import {
  assertOneCurrentArea,
  currentAreaIds,
  encodeQuotedCsv,
  type FetchJson,
  type GeographyFileEntry,
  writeGeographyFile,
} from './geography-files.ts';
import { DERIVED_ID_TIMESTAMP_MS, uuid7 } from './uuid7.ts';

/** Upper tier local authorities. */
const AREA_TYPE = 502;
/** The 2024 NHS England peer groups (https://github.com/NHSDigital/ASC_LA_Peer_Groups). */
const NEIGHBOUR_TYPE = 15;
const NEIGHBOURS_PER_AREA = 15;
const SCHEME = 'NHS England peer groups (2024)';
const SOURCE = `Fingertips API, neighbour type ${NEIGHBOUR_TYPE}: NHS England peer groups (2024), upper tier local authorities (area type ${AREA_TYPE})`;

/**
 * The UUID tag of the neighbour ids. It follows the 21 tags `prepare-baseline` gives the tables it
 * rekeys, so a neighbour id never collides with another table's.
 */
export const AREA_NEIGHBOUR_TAG = 22;

const areasSchema = z.array(z.object({ Code: z.string() }));
// Only the peer group's neighbours are read, so other neighbour types may take any shape.
const neighbourGroupsSchema = z.object({
  NeighbourAreaDet: z.array(z.looseObject({ NeighbourTypeId: z.number() })),
});
const peerGroupSchema = z.object({
  NeighbourAreas: z.array(z.object({ AreaCode: z.string(), Position: z.number() })),
});

export interface AreaNeighbour {
  code: string;
  neighbourCode: string;
  position: number;
}

/**
 * A UUIDv7 from the council's code, the scheme and the position, so a neighbour keeps its id
 * whatever else the file holds.
 */
export function areaNeighbourId(code: string, position: number): string {
  const digest = createHash('sha256').update(`${code}\0${SCHEME}\0${position}`).digest();
  const suffix = digest.readBigUInt64BE(0) & ((1n << 62n) - 1n);
  return uuid7(DERIVED_ID_TIMESTAMP_MS, AREA_NEIGHBOUR_TAG, suffix);
}

/**
 * Each upper tier council's ranked peer group, in code and then position order. Fingertips serves
 * the rankings Pholio holds in L_AreaCodeNeighbourMapping, and only the ranking, so that is all a
 * row carries. A council without exactly one peer group of 15 distinct ranked neighbours stops
 * the export rather than writing part of it.
 */
export async function neighbourRows(fetchJson: FetchJson): Promise<AreaNeighbour[]> {
  const areas = areasSchema.parse(await fetchJson(`areas/by_area_type?area_type_id=${AREA_TYPE}`));
  const codes = areas.map(({ Code }) => Code).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const rows: AreaNeighbour[] = [];
  for (const code of codes) {
    const detail = neighbourGroupsSchema.parse(
      await fetchJson(`areas/nearest_neighbours?area_type_id=${AREA_TYPE}&area_code=${code}`),
    );
    const groups = detail.NeighbourAreaDet.filter(
      (group) => group.NeighbourTypeId === NEIGHBOUR_TYPE,
    );
    const [group] = groups;
    if (groups.length !== 1 || !group) {
      throw new Error(`Expected one neighbour-type-${NEIGHBOUR_TYPE} group for ${code}`);
    }
    const neighbours = [...peerGroupSchema.parse(group).NeighbourAreas].sort(
      (a, b) => a.Position - b.Position,
    );
    const ranked = neighbours.every(({ Position }, index) => Position === index + 1);
    if (
      neighbours.length !== NEIGHBOURS_PER_AREA ||
      !ranked ||
      new Set(neighbours.map(({ AreaCode }) => AreaCode)).size !== NEIGHBOURS_PER_AREA
    ) {
      throw new Error(`Expected ${NEIGHBOURS_PER_AREA} ranked neighbours for ${code}`);
    }
    if (neighbours.some(({ AreaCode }) => AreaCode === code)) {
      throw new Error(`Council cannot be its own neighbour: ${code}`);
    }
    rows.push(
      ...neighbours.map(({ AreaCode, Position }) => ({
        code,
        neighbourCode: AreaCode,
        position: Position,
      })),
    );
  }
  if (rows.length === 0) throw new Error('No upper tier local authorities returned');
  return rows;
}

/** The file's CSV, naming each council and neighbour by the id of its current area. */
export function areaNeighbourCsv(
  rows: readonly AreaNeighbour[],
  areaIds: ReadonlyMap<string, readonly string[]>,
): string {
  assertOneCurrentArea(
    rows.flatMap(({ code, neighbourCode }) => [code, neighbourCode]),
    areaIds,
  );
  return encodeQuotedCsv([
    ['id', 'area_id', 'neighbour_area_id', 'scheme', 'position'],
    ...rows.map(({ code, neighbourCode, position }) => [
      areaNeighbourId(code, position),
      areaIds.get(code)?.[0] ?? '',
      areaIds.get(neighbourCode)?.[0] ?? '',
      SCHEME,
      position,
    ]),
  ]);
}

/**
 * Rebuilds `area_neighbour.csv.gz` from the Fingertips API and records it in the geography
 * manifest. Rows reference the current area of each code in `area.csv.gz`, so run it again after
 * that file changes.
 */
export async function exportAreaNeighbours(
  dataDirectory: string,
  fetchJson: FetchJson,
): Promise<GeographyFileEntry & { written: boolean; areas: number }> {
  const geography = join(dataDirectory, 'geography');
  const areaIds = await currentAreaIds(geography);
  const rows = await neighbourRows(fetchJson);
  const csv = areaNeighbourCsv(rows, areaIds);
  const entry = await writeGeographyFile(geography, 'area_neighbour', SOURCE, csv, rows.length);
  return { ...entry, areas: new Set(rows.map(({ code }) => code)).size };
}
