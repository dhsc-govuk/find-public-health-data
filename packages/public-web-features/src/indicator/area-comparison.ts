import { isRollingPeriod } from '@fphd/utils/observation-series';
import { areasInGeographyGroup } from '../geography/groups.ts';
import {
  alignedTrendSeries,
  type BenchmarkJudgement,
  benchmarkJudgement,
  comparisonRows,
  filterObservations,
} from './data.ts';
import type { IndicatorObservation, SelectedIndicator } from './loader.ts';

export const AREA_COMPARISON_GROUPS = new Set([
  'Local authorities',
  'Statistical regions',
  'NHS regions',
  'Integrated care boards',
]);

/** The area type whose areas group each comparison level in the picker, as in the prototype. */
export const AREA_COMPARISON_PARENT_TYPES: Partial<Record<string, string>> = {
  'Local authorities': 'Regions (statistical)',
  'Integrated care boards': 'NHS regions',
};

type AreaOption = {
  code: string;
  name: string;
  parent?: { code: string; name: string } | null | undefined;
  neighbours?: string[] | undefined;
};

/** A comparison area with its region and, once looked up, its statistical neighbours. */
export type CompareAreaOption = AreaOption;

/** Only councils have statistical neighbours: NHS England's peer groups for upper tier ones. */
export const AREA_NEIGHBOUR_GROUPS = new Set(['Local authorities']);

/**
 * Whether a request should carry the compare areas tab's regions and neighbours: only when that
 * tab is asked for, or every section is, so other tabs don't pay for them.
 */
export function wantsCompareAreaDetail(params: URLSearchParams) {
  return params.get('tab-indicator') === 'areas' || params.get('render') === 'complete';
}

/** The options with each listed area's neighbours added. */
export function withNeighbours<T extends AreaOption>(
  areas: T[],
  lists: { code: string; neighbours: string[] }[],
): T[] {
  const byCode = new Map(lists.map(({ code, neighbours }) => [code, neighbours]));
  return areas.map((area) => {
    const neighbours = byCode.get(area.code);
    return neighbours ? { ...area, neighbours } : area;
  });
}

/** The comparison areas under their regions, regions by name, areas in their listed order. */
export function areaComparisonRegions(areas: AreaOption[]) {
  const regions = new Map<string, { code: string; name: string; areas: string[] }>();
  for (const { code, parent } of areas) {
    if (!parent) continue;
    const region = regions.get(parent.code) ?? { ...parent, areas: [] };
    region.areas.push(code);
    regions.set(parent.code, region);
  }
  return [...regions.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Apply region checkbox changes to the submitted area ticks. The original region state lets
 * no-script submissions distinguish a bulk change from an individual area's untick.
 */
export function highlightedAreaCodes(params: URLSearchParams, areas: AreaOption[]): string[] {
  const regions = new Set(params.getAll('highlightRegion'));
  const before = new Set(params.getAll('highlightRegionBefore'));
  const query = params.get('geo-q')?.trim().toLowerCase() ?? '';
  const highlighted = new Set(params.getAll('highlight'));
  const matches = areas.filter(
    ({ code, name }) =>
      !query || name.toLowerCase().includes(query) || code.toLowerCase() === query,
  );
  const untickedRegions = new Set([...before].filter((code) => !regions.has(code)));
  // Missing member ticks take precedence when both a region and its members are unticked.
  for (const { code, parent } of matches) {
    if (parent && !highlighted.has(code)) untickedRegions.delete(parent.code);
  }
  for (const { code, parent } of matches) {
    if (!parent) continue;
    // Unchanged region boxes leave individual ticks in charge after a no-script submission.
    if (regions.has(parent.code) && !before.has(parent.code)) highlighted.add(code);
    if (untickedRegions.has(parent.code)) highlighted.delete(code);
  }
  return [...highlighted];
}

/** The highlighted areas of the listed options, in the order they were highlighted. */
export function highlightedAreas<T extends AreaOption>(params: URLSearchParams, areas: T[]): T[] {
  const byCode = new Map(areas.map((area) => [area.code, area]));
  return highlightedAreaCodes(params, areas).flatMap((code) => {
    const area = byCode.get(code);
    return area ? [area] : [];
  });
}

/**
 * The query with one area no longer highlighted. Region ticks are folded into the highlight
 * list first, so a ticked region does not highlight the area again. Until the areas' regions
 * have loaded, a region tick can't be expanded into its areas, so the region ticks stay and
 * only the area's own highlight is removed.
 */
export function withoutHighlightedArea(
  params: URLSearchParams,
  areas: AreaOption[],
  code: string,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('neighbours', code);
  if (
    (params.has('highlightRegion') || params.has('highlightRegionBefore')) &&
    areas.some(({ parent }) => parent === undefined)
  ) {
    next.delete('highlight', code);
    return next;
  }
  next.delete('highlight');
  next.delete('highlightRegion');
  next.delete('highlightRegionBefore');
  for (const entry of highlightedAreaCodes(params, areas)) {
    if (entry !== code) next.append('highlight', entry);
  }
  return next;
}

/** The query with no area highlighted and no statistical neighbours shown. */
export function withoutHighlightedAreas(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['highlight', 'highlightRegion', 'highlightRegionBefore', 'neighbours']) {
    next.delete(key);
  }
  return next;
}

/** Highlighted areas that have statistical neighbours, in the order they were highlighted. */
export function neighbourAnchors<T extends AreaOption>(highlighted: string[], areas: T[]): T[] {
  const byCode = new Map(areas.map((area) => [area.code, area]));
  return highlighted.flatMap((code) => {
    const area = byCode.get(code);
    return area?.neighbours?.length ? [area] : [];
  });
}

/**
 * The areas to list while some "Statistical neighbours for" boxes are ticked: each ticked area
 * and its neighbours. Null while none is ticked, when every area is listed.
 */
export function statisticalNeighbourAreas(
  params: URLSearchParams,
  areas: AreaOption[],
): Set<string> | null {
  const ticked = new Set(params.getAll('neighbours'));
  const anchors = neighbourAnchors(highlightedAreaCodes(params, areas), areas).filter(({ code }) =>
    ticked.has(code),
  );
  if (anchors.length === 0) return null;
  return new Set(anchors.flatMap(({ code, neighbours = [] }) => [code, ...neighbours]));
}

export function areaComparisonOptions<T extends { code: string }>(areas: T[], group: string): T[] {
  if (group !== 'Local authorities') return areas;
  const upperTier = areasInGeographyGroup(areas, 'Upper-tier local authorities');
  return upperTier.length ? upperTier : areas;
}

export function comparisonRankingData(indicator: SelectedIndicator) {
  const cells = comparisonRows([indicator])[0]?.cells ?? [];
  const latest = cells
    .flatMap(({ series }) => series)
    .filter(({ value }) => value !== null)
    .sort((a, b) => a.toDate.localeCompare(b.toDate) || a.fromDate.localeCompare(b.fromDate))
    .at(-1);
  return indicator.areaData.map((area) => ({
    ...area,
    observations:
      cells
        .find(({ areaCode }) => areaCode === area.areaCode)
        ?.series.filter(
          ({ fromDate, toDate, value }) =>
            value !== null && fromDate === latest?.fromDate && toDate === latest?.toDate,
        ) ?? [],
  }));
}

export function areaComparisonRows(
  indicator: SelectedIndicator,
  areaData: SelectedIndicator['areaData'],
  sort: string,
) {
  const row = comparisonRows([
    {
      ...indicator,
      areaData: areaData.filter(({ areaCode }) => areaCode !== 'E92000001'),
    },
  ])[0];
  const englandRows = comparisonRows([
    {
      ...indicator,
      areaData: indicator.areaData.filter(({ areaCode }) => areaCode === 'E92000001'),
    },
  ]);
  const englandRow =
    englandRows.find((entry) => entry.sex === row?.sex && entry.periodType === row?.periodType) ??
    englandRows[0];
  const benchmarkCell = englandRow?.cells[0];
  const reference = row?.series.at(-1);
  const benchmarkPoint =
    reference && row
      ? alignedTrendSeries(
          filterObservations(
            indicator.areaData.find((area) => area.areaCode === 'E92000001')?.observations ?? [],
            row,
          ),
          reference,
        ).find(
          (point) => point.fromDate === reference.fromDate && point.toDate === reference.toDate,
        )
      : undefined;
  const england =
    benchmarkCell && reference
      ? {
          ...benchmarkCell,
          value: benchmarkPoint?.value ?? null,
          count: benchmarkPoint?.count ?? null,
          series: benchmarkPoint ? [benchmarkPoint] : [],
          notes: benchmarkPoint?.notes.map((note) => note.text) ?? [],
        }
      : benchmarkCell;
  const areas = (row?.cells.filter(({ areaCode }) => areaCode !== 'E92000001') ?? []).sort(
    compareAreaRows(sort),
  );
  return {
    england,
    rows: england ? [england, ...areas] : areas,
    period: row?.period || englandRow?.period || '',
    multiYear: reference ? isRollingPeriod(reference) : false,
  };
}

type SortableAreaRow = { areaCode: string; areaName: string; value: number | null };

// Areas without a value go last, alphabetically, whatever the sort.
function compareAreaRows(sort: string) {
  return (left: SortableAreaRow, right: SortableAreaRow) => {
    if (sort === 'alphabetical') return left.areaName.localeCompare(right.areaName);
    if (left.value === null || right.value === null) {
      return left.value === right.value
        ? left.areaName.localeCompare(right.areaName)
        : left.value === null
          ? 1
          : -1;
    }
    return sort === 'ascending' ? left.value - right.value : right.value - left.value;
  };
}

function listedAreaRows<T extends SortableAreaRow>(rows: T[], only: Set<string> | null) {
  return new Map(
    rows
      .filter((row) => !only || row.areaCode === 'E92000001' || only.has(row.areaCode))
      .map((row) => [row.areaCode, row]),
  );
}

/** The highlighted areas the table lists, in the order picked; England is never highlighted. */
export function highlightedAreaRows<T extends SortableAreaRow>(
  rows: T[],
  highlighted: string[],
  only: Set<string> | null = null,
): T[] {
  const byCode = listedAreaRows(rows, only);
  return [...new Set(highlighted)].flatMap((code) => {
    const row = code === 'E92000001' ? undefined : byCode.get(code);
    return row ? [row] : [];
  });
}

/**
 * Highlighted areas in the order they were picked, then England, then the rest by `sort`. While
 * statistical neighbours are shown, only those areas are listed, with England.
 */
export function orderAreaComparisonRows<T extends SortableAreaRow>(
  rows: T[],
  sort: string,
  highlighted: string[],
  only: Set<string> | null = null,
): T[] {
  const byCode = listedAreaRows(rows, only);
  const first = highlightedAreaRows(rows, highlighted, only);
  const england = byCode.get('E92000001');
  const rest = [...byCode.values()]
    .filter((row) => row.areaCode !== 'E92000001' && !first.includes(row))
    .sort(compareAreaRows(sort));
  return [...first, ...(england ? [england] : []), ...rest];
}

export type AreaColourMode = 'england' | 'quintiles';

// Links from before quartiles were dropped still carry areaColour=quartiles.
export function areaColourMode(value: string | null): AreaColourMode {
  return value === 'quintiles' ? 'quintiles' : 'england';
}

export function areaComparisonLabel(
  cell: ReturnType<typeof areaComparisonRows>['rows'][number],
  england: ReturnType<typeof areaComparisonRows>['england'],
  detail: SelectedIndicator['detail'],
) {
  if (cell.areaCode === 'E92000001') return '';
  const judgement = benchmarkJudgement(cell.series.at(-1), england?.value ?? null, detail);
  return {
    better: 'Better',
    similar: 'Similar',
    worse: 'Worse',
    higher: 'Higher',
    lower: 'Lower',
    none: '',
  }[judgement];
}

export function areaComparisonGroups(
  rows: Pick<ReturnType<typeof areaComparisonRows>['rows'][number], 'areaCode' | 'value'>[],
  colour: AreaColourMode,
) {
  const size = colour === 'quintiles' ? 5 : 0;
  const heading = size ? 'Quintile' : 'Compared with England';
  const labels = new Map<string, string>();
  if (!size) return { heading, labels };
  const sorted = rows
    .filter(
      (row): row is typeof row & { value: number } =>
        row.areaCode !== 'E92000001' && row.value !== null,
    )
    .sort((left, right) => left.value - right.value);
  const ties = new Map<string, number>();
  sorted.forEach((row, index) => {
    const value = row.value.toFixed(3);
    const group = ties.get(value) ?? Math.floor((index * size) / sorted.length) + 1;
    ties.set(value, group);
    labels.set(
      row.areaCode,
      `${heading} ${group}${group === 1 ? ' (lowest)' : group === size ? ' (highest)' : ''}`,
    );
  });
  return { heading, labels };
}

export function areaComparisonBarMaximum(rows: ReturnType<typeof areaComparisonRows>['rows']) {
  const top = Math.max(
    0,
    ...rows.flatMap((row) => [row.value ?? 0, row.series.at(-1)?.upperCi95 ?? 0]),
  );
  if (top === 0) return 1;
  const step = 10 ** Math.floor(Math.log10(top)) / 2;
  return Math.ceil((top * 1.05) / step) * step;
}

// Indicators with no polarity use tonal steps of dark blue, darkest for higher than England.
export const noPolarityComparisonColours = {
  higher: '#0E3F69',
  similar: '#698AAB',
  lower: '#CEE0F3',
} as const;

export function areaComparisonBarColour(
  label: string,
  mode: AreaColourMode,
  benchmark: boolean,
  neutral = false,
) {
  if (benchmark) return '#b1b4b6';
  // Tonal steps of the chart turquoise, lightest for the lowest values. Each step is at least
  // 1.5:1 from the next, so neighbouring groups stay apart in greyscale; bars carry a dark
  // outline because the lighter steps are under 3:1 against white.
  if (mode === 'quintiles') {
    return (
      ['#C5EEE9', '#84CAC2', '#27A096', '#027068', '#004842'][Number(label.split(' ')[1]) - 1] ??
      '#b1b4b6'
    );
  }
  const colours: Record<string, string> = neutral
    ? {
        Higher: noPolarityComparisonColours.higher,
        Similar: noPolarityComparisonColours.similar,
        Lower: noPolarityComparisonColours.lower,
      }
    : { Better: '#8ED973', Similar: '#FFC000', Worse: '#C00000' };
  return colours[label] ?? '#b1b4b6';
}

export function observationComparisonLabel(
  observation: IndicatorObservation | undefined,
  benchmark: number | null,
  detail: SelectedIndicator['detail'],
  confidence: '95' | '99.8' = '95',
) {
  return benchmarkJudgementLabel(benchmarkJudgement(observation, benchmark, detail, confidence));
}

export function benchmarkJudgementLabel(judgement: BenchmarkJudgement) {
  return {
    better: 'Better than England',
    similar: 'Similar to England',
    worse: 'Worse than England',
    higher: 'Higher than England',
    lower: 'Lower than England',
    none: '',
  }[judgement];
}
