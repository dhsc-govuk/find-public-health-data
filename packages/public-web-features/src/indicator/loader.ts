import {
  areaDisplayGroupListSchema,
  areaLookupListSchema,
  areaParentListSchema,
  DEFAULT_INDICATOR_SEARCH_RESULTS,
  displayGroupListSchema,
  type IndicatorAreaData,
  type IndicatorDetail,
  type IndicatorRangePeriod,
  indicatorAreaDataListSchema,
  indicatorAreaDataSchema,
  indicatorDetailSchema,
  indicatorListResponseSchema,
  indicatorRangeSchema,
  MAX_AREA_CODES_PER_REQUEST,
  MAX_AREA_GROUPS_PER_REQUEST,
  MAX_AREA_NAME_LENGTH,
  MAX_INDICATOR_QUERY_LENGTH,
  pickAreaCodes,
} from '@fphd/public-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs } from 'react-router';
import {
  areasInGeographyGroup,
  normalizePublicLevels,
  publicGeographyLevels,
  sourceGeographyGroup,
} from '../geography/groups.ts';
import { loadGeographyOptions } from '../geography/loader.ts';
import { MAX_SELECTED_AREAS, MAX_SELECTED_INDICATORS } from '../selection-limits.ts';
import { areaComparisonOptions } from './area-comparison.ts';
import { loadInBatches } from './batches.ts';
import { loadIndicatorTableEntries } from './table-loader.ts';

export type {
  AreaGroup,
  AreaSummary,
  IndicatorAreaData,
  IndicatorDetail,
  IndicatorObservation,
  IndicatorProviderSource,
  IndicatorRangePeriod,
  IndicatorSummary,
} from '@fphd/public-api-features/contract';

export interface IndicatorSelection {
  areaCodes: string[];
  /** Whole geography levels selected as one ("Local authorities"), kept as a single
   *  chip and query value rather than hundreds of individual area codes. */
  areaLevels: string[];
  shortIds: number[];
}

/** One selected indicator with the area data backing its charts. */
export interface SelectedIndicator {
  detail: IndicatorDetail;
  areaData: IndicatorAreaData[];
  /** The statistical regions the selected areas roll up to, for the region benchmark. */
  regionData?: IndicatorAreaData[];
  /** Per display level ('Local authorities', 'Statistical regions'…): min/max of the
   *  value across every area of that level, per period — the comparison range. */
  ranges?: Record<string, IndicatorRangePeriod[]>;
}

/** A picked area resolved to its display name and level. */
export interface SelectedArea {
  code: string;
  name: string;
  level: string;
}

/** Which benchmark each selected area can be compared against. */
export interface BenchmarkGeography {
  /** Selected area code → its statistical region, where one exists. */
  regionByCode: Record<string, { code: string; name: string }>;
  /** Selected area code → its display level, for picking the England range. */
  levelByCode: Record<string, string>;
}

export interface IndicatorPageData {
  detail: IndicatorDetail;
  compared: IndicatorDetail | undefined;
  groups: { displayGroup: string; areas: { code: string; name: string }[] }[];
}

const DEFAULT_AREA_CODE = 'E92000001';
const singleAreaBatchSchema = indicatorAreaDataSchema.transform((one) => [one]);

// Charts and tables with dozens of series are unreadable long before they are slow, so the
// selection is capped rather than the URL trusted.
export { MAX_SELECTED_INDICATORS } from '../selection-limits.ts';

function selectedIndicatorIds(
  url: URL,
  routeShortId: number | undefined,
  limit = MAX_SELECTED_INDICATORS,
): number[] {
  const fromQuery = url.searchParams
    .getAll('is')
    .filter((value) => /^\d+$/.test(value))
    .map(Number);

  // The route slug is the deep link into a single indicator; a query selection replaces
  // it, so a link out of the page never silently re-adds where the user arrived from.
  const ids = fromQuery.length > 0 ? fromQuery : routeShortId !== undefined ? [routeShortId] : [];

  return [...new Set(ids)].slice(0, limit);
}

/**
 * Kept free of any @fphd/ui import so it can be unit-tested without the jsdom/SSR
 * environment the GOV.UK component library needs. Selection state lives in the query
 * string (`is` = indicators, `ats` = area type, `as` = area codes, all repeatable) so the
 * page is a working form without client JavaScript and every view is a shareable URL.
 *
 * The client turns the API's 404 into a thrown 404 Response, so React Router renders the
 * nearest not-found boundary instead of the page component. It also encodes the path
 * segment — React Router decodes %2F inside a single dynamic segment, so an un-encoded id
 * of '../topics' would normalise the request onto a different API route entirely.
 */
export async function loadIndicatorData(
  { context, request }: LoaderFunctionArgs,
  {
    page,
    tableDisplayGroups,
    wholeAreaGroups = false,
  }: {
    page?: IndicatorPageData;
    tableDisplayGroups?: string[];
    wholeAreaGroups?: boolean;
  } = {},
) {
  const url = new URL(request.url);
  const api = context.get(apiContext);
  const routeDetail = page?.detail;
  const comparedDetail = page?.compared;
  const indicatorGroups = page?.groups;
  const singlePage = page !== undefined;
  const includePageData = singlePage;

  // De-duplicated: a hand-edited URL repeating a code would otherwise fetch it twice and
  // render it twice.
  const requestedAreaCodes = pickAreaCodes(
    url.searchParams.getAll('as'),
    Number.POSITIVE_INFINITY,
  ).filter((code) => code !== DEFAULT_AREA_CODE);
  const areaCodes = requestedAreaCodes.slice(0, MAX_SELECTED_AREAS);
  let requestedLevels = [
    ...new Set(
      url.searchParams
        .getAll('als')
        .filter((level) => level !== '' && level.length <= MAX_AREA_NAME_LENGTH),
    ),
  ].slice(0, MAX_AREA_GROUPS_PER_REQUEST);

  if (singlePage) requestedLevels = normalizePublicLevels(requestedLevels);

  // A whole-level selection ("Local authorities") rides in the URL as its name; its
  // areas are resolved here, subject to the same cap as hand-picked codes.
  let levelCodes: string[] = [];
  if (requestedLevels.length > 0) {
    const sources = [...new Set(requestedLevels.map(sourceGeographyGroup))];
    const levelGroups =
      indicatorGroups && routeDetail
        ? (
            await loadInBatches(sources, (source) =>
              api.get(
                `${apiPath`/api/indicators/${routeDetail.slug}/areas`}?displayGroup=${encodeURIComponent(source)}`,
                areaDisplayGroupListSchema,
              ),
            )
          ).flat()
        : await api.get(
            `/api/areas?${sources.map((source) => `displayGroup=${encodeURIComponent(source)}`).join('&')}`,
            areaDisplayGroupListSchema,
          );
    levelCodes = requestedLevels.flatMap((level) =>
      levelGroups
        .filter((group) => group.displayGroup === sourceGeographyGroup(level))
        .flatMap(({ displayGroup, areas }) =>
          (wholeAreaGroups
            ? areaComparisonOptions(areas, displayGroup)
            : areasInGeographyGroup(areas, level)
          ).map(({ code }) => code),
        ),
    );
  }
  // England rides along last for the benchmark; the first entry stays the area the page describes.
  const pickedCodes = [...new Set([...areaCodes, ...levelCodes])]
    .filter((code) => code !== DEFAULT_AREA_CODE)
    .slice(0, wholeAreaGroups ? Number.POSITIVE_INFINITY : MAX_SELECTED_AREAS);
  const codesToLoad = [...pickedCodes, DEFAULT_AREA_CODE];
  const areasLimited =
    new Set([...requestedAreaCodes, ...levelCodes].filter((code) => code !== DEFAULT_AREA_CODE))
      .size > MAX_SELECTED_AREAS && !wholeAreaGroups;

  // Both benchmarks need each picked area's display level and statistical region up front.
  const nonEnglandCodes = codesToLoad.filter((code) => code !== DEFAULT_AREA_CODE);

  // Only the picked areas resolve to names and levels — the tree fetches its own
  // catalogue on demand, keeping thousands of areas out of the page payload.
  const codeQuery = nonEnglandCodes.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&');
  const [lookedUp, areaParents, catalogueGroups] = await Promise.all([
    nonEnglandCodes.length > 0
      ? Promise.all(
          Array.from(
            { length: Math.ceil(nonEnglandCodes.length / MAX_AREA_CODES_PER_REQUEST) },
            (_, index) => {
              const batch = nonEnglandCodes.slice(
                index * MAX_AREA_CODES_PER_REQUEST,
                (index + 1) * MAX_AREA_CODES_PER_REQUEST,
              );
              return api.get(
                `/api/areas/lookup?${batch.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&')}`,
                areaLookupListSchema,
              );
            },
          ),
        ).then((batches) => batches.flat())
      : Promise.resolve([]),
    nonEnglandCodes.length > 0 && tableDisplayGroups === undefined
      ? api.get(
          `/api/areas/parents?${codeQuery}&parentType=${encodeURIComponent('Regions (statistical)')}`,
          areaParentListSchema,
        )
      : Promise.resolve([]),
    // The user-facing levels live on area_type now; the list validates `als` values after
    // the fact (level expansion tolerates unknown groups) and feeds the tree.
    indicatorGroups
      ? Promise.resolve(indicatorGroups.map(({ displayGroup }) => displayGroup))
      : tableDisplayGroups !== undefined
        ? Promise.resolve(tableDisplayGroups)
        : includePageData
          ? api.get('/api/areas/display-groups', displayGroupListSchema)
          : Promise.resolve([]),
  ]);
  const displayGroups = singlePage ? publicGeographyLevels(catalogueGroups) : catalogueGroups;
  const areaLevels = requestedLevels.filter((level) => displayGroups.includes(level));
  const geographyOptions = includePageData
    ? await loadGeographyOptions(api, url.searchParams, displayGroups, {
        indicator: singlePage ? routeDetail?.slug : undefined,
        previews: indicatorGroups,
        publicOnly: singlePage,
      })
    : undefined;

  const selectedAreas = lookedUp.map(({ code, name, areaType: typeName, displayGroup }) => ({
    code,
    name,
    level: displayGroup ?? typeName,
  }));
  const levelByCode: Record<string, string> = {};
  for (const { code, level } of selectedAreas) {
    levelByCode[code] = level;
  }
  const regionByCode: Record<string, { code: string; name: string }> = {};
  for (const { code, parentCode, parentName } of areaParents) {
    regionByCode[code] = { code: parentCode, name: parentName };
  }

  const pickedLevels = [...new Set(Object.values(levelByCode))];
  const regionCodes = [...new Set(Object.values(regionByCode).map(({ code }) => code))];

  // Benchmark data is expensive (a range query aggregates every observation of a level),
  // so it is fetched only for indicators whose cmp/cr options actually display it.
  const comparisonFor = (id: number) => {
    const choices = [
      url.searchParams.get(`cmp-${id}`) ?? 'none',
      url.searchParams.get('cmp-compare') ?? 'none',
    ];
    const ranges = [
      url.searchParams.get(`cr-${id}`) === 'yes',
      url.searchParams.get('cr-compare') === 'yes',
    ];
    const rangeLevels = new Set<string>();
    choices.forEach((choice, index) => {
      if (!ranges[index]) {
        return;
      }
      if (choice === 'england') {
        for (const level of pickedLevels) {
          rangeLevels.add(level);
        }
      }
      if (choice === 'region') {
        rangeLevels.add('Statistical regions');
      }
    });
    return { region: choices.includes('region'), rangeLevels: [...rangeLevels] };
  };

  const shortIds =
    singlePage && routeDetail
      ? [routeDetail.shortId, ...(comparedDetail ? [comparedDetail.shortId] : [])]
      : selectedIndicatorIds(
          url,
          routeDetail?.shortId,
          tableDisplayGroups === undefined ? MAX_SELECTED_INDICATORS : Number.POSITIVE_INFINITY,
        );
  // `find` is the quicksearch form's no-script round trip; matches render as add links.
  const findSubject =
    url.searchParams.get('find')?.trim().slice(0, MAX_INDICATOR_QUERY_LENGTH) ?? '';
  const findResults =
    includePageData && findSubject
      ? (
          await api.get(
            `/api/indicators?q=${encodeURIComponent(findSubject)}&limit=${DEFAULT_INDICATOR_SEARCH_RESULTS}`,
            indicatorListResponseSchema,
          )
        ).indicators
      : [];
  const selected =
    tableDisplayGroups !== undefined
      ? await loadIndicatorTableEntries(api, shortIds, codesToLoad)
      : await loadInBatches(shortIds, async (id) => {
          const dataBatch = (codes: string[]) =>
            api.get(
              `${apiPath`/api/indicators/${String(id)}/data`}?${codes
                .map((code) => `areaCode=${encodeURIComponent(code)}`)
                .join('&')}`,
              codes.length === 1 ? singleAreaBatchSchema : indicatorAreaDataListSchema,
            );
          const dataFor = async (codes: string[]) => {
            // A stable first batch lets whole-group and individual-area tables share their England read.
            const ordered =
              tableDisplayGroups !== undefined && codes.includes(DEFAULT_AREA_CODE)
                ? [DEFAULT_AREA_CODE, ...codes.filter((code) => code !== DEFAULT_AREA_CODE)]
                : codes;
            const loaded = (
              await loadInBatches(
                Array.from(
                  { length: Math.ceil(ordered.length / MAX_AREA_CODES_PER_REQUEST) },
                  (_, index) =>
                    ordered.slice(
                      index * MAX_AREA_CODES_PER_REQUEST,
                      (index + 1) * MAX_AREA_CODES_PER_REQUEST,
                    ),
                ),
                dataBatch,
              )
            ).flat();
            const byCode = new Map(loaded.map((area) => [area.areaCode, area]));
            return codes.flatMap((code) => {
              const area = byCode.get(code);
              return area ? [area] : [];
            });
          };
          const comparison = comparisonFor(id);
          const [detail, areaData, regionData, rangeEntries] = await Promise.all([
            // The page's own indicator is already loaded; only the compared ones are fetched.
            id === routeDetail?.shortId
              ? routeDetail
              : api.get(apiPath`/api/indicators/${String(id)}`, indicatorDetailSchema),
            // One request per indicator carrying every area, rather than one per pair: a
            // page comparing ten indicators across twenty areas would otherwise fire 200.
            dataFor(codesToLoad),
            comparison.region && regionCodes.length > 0
              ? dataFor(regionCodes)
              : Promise.resolve([]),
            loadInBatches(comparison.rangeLevels, async (level) => {
              const range = await api.get(
                `${apiPath`/api/indicators/${String(id)}/range`}?displayGroup=${encodeURIComponent(level)}`,
                indicatorRangeSchema,
              );
              return [level, range.periods] as const;
            }),
          ]);
          return {
            detail,
            areaData,
            regionData,
            ranges: Object.fromEntries(rangeEntries),
          };
        });

  return {
    selected,
    selectedAreas,
    displayGroups,
    benchmarkGeography: { regionByCode, levelByCode } satisfies BenchmarkGeography,
    findSubject,
    findResults,
    geographyOptions,
    areasLimited,
    selection: { areaCodes, areaLevels, shortIds } satisfies IndicatorSelection,
  };
}

export { loadIndicator } from './single-loader.ts';

export async function loadIndicatorTableData(
  args: LoaderFunctionArgs,
  displayGroups: string[],
  wholeAreaGroups = false,
) {
  return loadIndicatorData(args, { tableDisplayGroups: displayGroups, wholeAreaGroups });
}
