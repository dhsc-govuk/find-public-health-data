import { readFile } from 'node:fs/promises';
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

/** Fingertips profile 19 holds the local authority deprivation categories on April 2023 geography. */
const PROFILE = 19;
const CATEGORIES = [
  { areaType: 502, categoryType: 170, tier: 'County & UA', scheme: 'IMD2025' },
  { areaType: 502, categoryType: 160, tier: 'County & UA', scheme: 'IMD2019' },
  { areaType: 501, categoryType: 173, tier: 'District & UA', scheme: 'IMD2025' },
  { areaType: 501, categoryType: 163, tier: 'District & UA', scheme: 'IMD2019' },
] as const;
const SOURCE = `Fingertips API, profile ${PROFILE}, area categories ${CATEGORIES.map(({ categoryType }) => categoryType).join(', ')}: IMD2025 and IMD2019 deciles, upper and lower tier local authorities (April 2023 geography)`;

const dimensionTypesSchema = z.array(z.object({ id: z.string(), name: z.string() }));
const dimensionValuesSchema = z.array(
  z.object({ id: z.string(), dimensionTypeId: z.string(), code: z.string().nullish() }),
);

export type DimensionTypes = z.infer<typeof dimensionTypesSchema>;
export type DimensionValues = z.infer<typeof dimensionValuesSchema>;

export interface AreaCategory {
  areaCode: string;
  dimensionValueId: string;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The dimension value id of each decile of a deprivation dimension type, named exactly once. */
function decileValues(
  name: string,
  types: DimensionTypes,
  values: DimensionValues,
): Map<number, string> {
  const matches = types.filter((type) => type.name === name);
  const [type] = matches;
  if (matches.length !== 1 || !type) throw new Error(`Expected one dimension type for ${name}`);
  const deciles = new Map<number, string>();
  for (let decile = 1; decile <= 10; decile++) {
    const decileMatches = values.filter(
      (value) => value.dimensionTypeId === type.id && value.code === String(decile),
    );
    const [value] = decileMatches;
    if (decileMatches.length !== 1 || !value) {
      throw new Error(`Expected one dimension value for ${name}, decile ${decile}`);
    }
    deciles.set(decile, value.id);
  }
  return deciles;
}

/**
 * Each local authority's IMD2025 and IMD2019 decile for both council tiers, resolved through the
 * committed dimension catalogs so the file and uploaded observations use the same ids, in area
 * code and then dimension value order. An empty or invalid answer stops the export rather than
 * writing part of it.
 */
export async function categoryRows(
  fetchJson: FetchJson,
  types: DimensionTypes,
  values: DimensionValues,
): Promise<AreaCategory[]> {
  const rows: AreaCategory[] = [];
  for (const { areaType, categoryType, tier, scheme } of CATEGORIES) {
    const name = `${tier} deprivation deciles in England (${scheme}, 4/23 geography)`;
    const deciles = decileValues(name, types, values);
    const membership = await fetchJson(
      `area_categories?profile_id=${PROFILE}&child_area_type_id=${areaType}&category_type_id=${categoryType}`,
    );
    if (
      typeof membership !== 'object' ||
      membership === null ||
      Array.isArray(membership) ||
      Object.keys(membership).length === 0
    ) {
      throw new Error(`No area categories returned for ${name}`);
    }
    for (const [areaCode, decile] of Object.entries(membership)) {
      const dimensionValueId = typeof decile === 'number' ? deciles.get(decile) : undefined;
      if (dimensionValueId === undefined) {
        throw new Error(`Invalid decile for ${areaCode}: ${JSON.stringify(decile)}`);
      }
      rows.push({ areaCode, dimensionValueId });
    }
  }
  return rows.sort(
    (a, b) =>
      compareText(a.areaCode, b.areaCode) || compareText(a.dimensionValueId, b.dimensionValueId),
  );
}

/** The file's CSV, keyed by area code; the core import resolves each code to its current area. */
export function areaCategoryCsv(
  rows: readonly AreaCategory[],
  areaIds: ReadonlyMap<string, readonly string[]>,
): string {
  assertOneCurrentArea(
    rows.map(({ areaCode }) => areaCode),
    areaIds,
  );
  return encodeQuotedCsv([
    ['area_code', 'dimension_value_id'],
    ...rows.map(({ areaCode, dimensionValueId }) => [areaCode, dimensionValueId]),
  ]);
}

/**
 * Rebuilds `area_category.csv.gz` from the Fingertips API and records it in the geography
 * manifest.
 */
export async function exportAreaCategories(
  dataDirectory: string,
  fetchJson: FetchJson,
): Promise<GeographyFileEntry> {
  const readJson = async (file: string) =>
    JSON.parse(await readFile(join(dataDirectory, file), 'utf8'));
  const types = dimensionTypesSchema.parse(await readJson('dimension-types.json'));
  const values = dimensionValuesSchema.parse(await readJson('dimension-values.json'));
  const geography = join(dataDirectory, 'geography');
  const rows = await categoryRows(fetchJson, types, values);
  const csv = areaCategoryCsv(rows, await currentAreaIds(geography));
  return writeGeographyFile(geography, 'area_category', SOURCE, csv, rows.length);
}
