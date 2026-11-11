import { ENGLAND_AREA_CODE } from '@fphd/utils/observation-series';
import {
  type ComparisonCell,
  comparisonAreas,
  comparisonRows,
  filterObservations,
  recentTrend,
  sameSegment,
  segmentValuesKey,
  trendSeries,
} from './data.ts';
import type { BenchmarkGeography, SelectedIndicator } from './loader.ts';

export type BenchmarkChoice = 'none' | 'england' | 'region';

export function comparisonTable(
  selected: SelectedIndicator[],
  geography: BenchmarkGeography,
  choice: BenchmarkChoice,
) {
  const rows = comparisonRows(selected);
  const areas = comparisonAreas(selected[0]?.areaData ?? []).map(({ areaCode, areaName }) => ({
    areaCode,
    areaName: areaName,
  }));
  const byId = new Map(selected.map((entry) => [entry.detail.shortId, entry]));
  const polarities = new Map(selected.map(({ detail }) => [detail.shortId, detail.polarity]));
  const trendOf = (
    row: (typeof rows)[number],
    cell: Pick<ComparisonCell, 'series' | 'trendDirection'>,
  ) => recentTrend(cell.series, polarities.get(row.shortId) ?? null, cell.trendDirection);
  const hasPickedAreas = areas.some(({ areaCode }) => areaCode !== ENGLAND_AREA_CODE);
  const regionAvailable = areas.some(({ areaCode }) => geography.regionByCode[areaCode]);
  const benchmark = hasPickedAreas ? choice : 'none';
  const benchmarkActive = benchmark !== 'none';
  const benchmarkNameFor = (areaCode: string): string | undefined => {
    if (!benchmarkActive) {
      return undefined;
    }
    if (benchmark === 'england') {
      return 'England';
    }
    const region = geography.regionByCode[areaCode];
    return region ? `${region.name} (Statistical region)` : undefined;
  };
  // The benchmark filtered the way the breakout row is — never all-persons beside a sexed row.
  const benchmarkCellFor = (
    row: (typeof rows)[number],
    cell: (typeof rows)[number]['cells'][number],
  ) => {
    const entry = byId.get(row.shortId);
    const latest = cell.series.at(-1);
    if (!entry || !latest || !benchmarkNameFor(cell.areaCode)) {
      return undefined;
    }
    const source =
      benchmark === 'england'
        ? entry.areaData.find(({ areaCode }) => areaCode === ENGLAND_AREA_CODE)
        : (entry.regionData ?? []).find(
            ({ areaCode }) => areaCode === geography.regionByCode[cell.areaCode]?.code,
          );
    const series = source
      ? trendSeries(
          filterObservations(source.observations, {
            sex: row.sex,
            periodType: row.periodType,
          }).filter((observation) => sameSegment(observation, latest)),
        )
      : [];
    const samePeriod = ({ fromDate, toDate }: { fromDate: string; toDate: string }) =>
      fromDate === latest.fromDate && toDate === latest.toDate;
    const rangeKey =
      benchmark === 'england'
        ? (geography.levelByCode[cell.areaCode] ?? '')
        : 'Statistical regions';
    return {
      value: series.find(samePeriod)?.value ?? null,
      // The range must describe the segment the row shows, not another population's spread.
      rangePeriod: (entry.ranges?.[rangeKey] ?? []).find(
        (range) => samePeriod(range) && range.segment === segmentValuesKey(latest),
      ),
      areaObservation: latest,
      detail: entry.detail,
    };
  };
  return {
    areas,
    rows,
    trendOf,
    hasPickedAreas,
    regionAvailable,
    benchmarkNameFor,
    benchmarkCellFor,
  };
}
