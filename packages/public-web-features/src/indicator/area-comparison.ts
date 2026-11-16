import { areasInGeographyGroup } from '../geography/groups.ts';
import {
  alignedTrendSeries,
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
          numerator: benchmarkPoint?.numerator ?? null,
          series: benchmarkPoint ? [benchmarkPoint] : [],
          notes: benchmarkPoint?.notes.map((note) => note.text) ?? [],
        }
      : benchmarkCell;
  const areas = (row?.cells.filter(({ areaCode }) => areaCode !== 'E92000001') ?? []).sort(
    (left, right) =>
      sort === 'alphabetical'
        ? left.areaName.localeCompare(right.areaName)
        : sort === 'ascending'
          ? (left.value ?? Number.POSITIVE_INFINITY) - (right.value ?? Number.POSITIVE_INFINITY)
          : (right.value ?? Number.NEGATIVE_INFINITY) - (left.value ?? Number.NEGATIVE_INFINITY),
  );
  return {
    england,
    rows: england ? [england, ...areas] : areas,
    period: row?.period || englandRow?.period || '',
    multiYear: reference
      ? Date.parse(reference.toDate) - Date.parse(reference.fromDate) > 400 * 86400000
      : false,
  };
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
  colour: string,
) {
  const size = colour === 'quartiles' ? 4 : colour === 'quintiles' ? 5 : 0;
  const heading = size === 4 ? 'Quartile' : size === 5 ? 'Quintile' : 'Compared with England';
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

export function areaComparisonBarColour(
  label: string,
  mode: string,
  benchmark: boolean,
  neutral = false,
) {
  if (benchmark) return '#b1b4b6';
  const palette =
    mode === 'quartiles'
      ? ['#440154', '#31688E', '#35B779', '#B4DE2C']
      : mode === 'quintiles'
        ? ['#440154', '#3E4A89', '#26828E', '#35B779', '#B4DE2C']
        : undefined;
  if (palette) return palette[Number(label.split(' ')[1]) - 1] ?? '#b1b4b6';
  const colours: Record<string, string> = {
    Better: '#8ED973',
    Similar: neutral ? '#FFFFFF' : '#FFC000',
    Worse: '#C00000',
    Higher: '#254BA4',
    Lower: '#A7B6DA',
  };
  return colours[label] ?? '#b1b4b6';
}

export function observationComparisonLabel(
  observation: IndicatorObservation | undefined,
  benchmark: number | null,
  detail: SelectedIndicator['detail'],
  confidence: '95' | '99.8' = '95',
) {
  const judgement = benchmarkJudgement(observation, benchmark, detail, confidence);
  return {
    better: 'Better than England',
    similar: 'Similar to England',
    worse: 'Worse than England',
    higher: 'Higher than England',
    lower: 'Lower than England',
    none: '',
  }[judgement];
}
