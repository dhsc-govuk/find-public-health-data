import { recentTrendDirection, type TrendDirection } from './recent-trend.ts';

interface SeriesObservation {
  fromDate: string;
  toDate: string;
  dimensions: { type: string; value: string }[];
}

export function observationSegmentKey(observation: SeriesObservation): string {
  return observation.dimensions.map(({ type, value }) => `${type}:${value}`).join('|');
}

export function isRollingPeriod(
  observation: Pick<SeriesObservation, 'fromDate' | 'toDate'>,
): boolean {
  return (Date.parse(observation.toDate) - Date.parse(observation.fromDate)) / 86_400_000 > 400;
}

export function headlineSeries<T extends SeriesObservation>(observations: T[]): T[] {
  if (!observations.length) return [];
  const minimum = Math.min(...observations.map(({ dimensions }) => dimensions.length));
  const candidates = observations.filter(({ dimensions }) => dimensions.length === minimum);
  const sizes = new Map<string, number>();
  for (const point of candidates) {
    const key = observationSegmentKey(point);
    sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }
  const winner = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0];
  return candidates
    .filter((point) => observationSegmentKey(point) === winner)
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate) || a.toDate.localeCompare(b.toDate));
}

export interface SeriesFilter {
  sex?: string;
  periodType?: 'all' | '1-year' | '3-year';
}

export interface TableSeriesSelection {
  sex: string;
  periodType: 'all' | '1-year' | '3-year';
  segments: Record<string, string>;
  trends?: Record<string, TrendDirection>;
  rowOrder?: Record<string, number>;
}

export function filterSeries<T extends SeriesObservation>(
  observations: T[],
  { sex, periodType = 'all' }: SeriesFilter,
): T[] {
  return observations.filter(
    (point) =>
      (periodType === 'all' || isRollingPeriod(point) === (periodType === '3-year')) &&
      (!sex || point.dimensions.some(({ type, value }) => type === 'Sex' && value === sex)),
  );
}

interface SortedSeriesObservation extends SeriesObservation {
  dimensions: { type: string; value: string; sortOrder: number }[];
}

/** Elect series before trimming history so shorter series cannot win a new tie. */
export function tableSummary<
  T extends {
    areaCode: string;
    observations: (SortedSeriesObservation & { value: number | null })[];
  },
>(
  areas: T[],
  points: 'recent' | 'latest' | 'sparkline' = 'recent',
): { tableSeries: TableSeriesSelection[]; areaData: T[] } {
  const sexes = new Set([
    '',
    ...areas.flatMap((area) =>
      area.observations.flatMap((point) =>
        point.dimensions.filter(({ type }) => type === 'Sex').map(({ value }) => value),
      ),
    ),
  ]);
  const tableSeries: TableSeriesSelection[] = [];
  const keep = new Set<SeriesObservation>();
  const england = areas.find(({ areaCode }) => areaCode === 'E92000001');
  const variantsByArea = new Map(
    areas.map((area) => [area.areaCode, comparisonVariants(area.observations)]),
  );
  for (const sex of sexes) {
    for (const periodType of ['all', '1-year', '3-year'] as const) {
      const trends: Record<string, TrendDirection> = {};
      const rowOrder: Record<string, number> = {};
      const selection: TableSeriesSelection = { sex, periodType, segments: {}, trends, rowOrder };
      for (const area of areas) {
        const order =
          variantsByArea
            .get(area.areaCode)
            ?.findIndex((variant) => variant.sex === sex && variant.periodType === periodType) ??
          -1;
        if (order >= 0) rowOrder[area.areaCode] = order;
        const series = headlineSeries(filterSeries(area.observations, selection));
        const latest = series.at(-1);
        if (!latest) continue;
        selection.segments[area.areaCode] = observationSegmentKey(latest);
        trends[area.areaCode] = recentTrendDirection(series.map(({ value }) => value));
        if (points !== 'latest')
          for (const point of series.filter(({ value }) => value !== null).slice(-5))
            keep.add(point);
        if (points === 'sparkline') for (const point of series.slice(-8)) keep.add(point);
        keep.add(latest);
        for (const point of england?.observations ?? [])
          if (
            point.fromDate === latest.fromDate &&
            point.toDate === latest.toDate &&
            observationSegmentKey(point) === observationSegmentKey(latest)
          )
            keep.add(point);
      }
      tableSeries.push(selection);
    }
  }
  return {
    tableSeries,
    areaData: areas.map((area) => ({
      ...area,
      observations: area.observations.filter((point) => keep.has(point)),
    })),
  };
}

export function comparisonVariants(observations: SortedSeriesObservation[]) {
  const sexes = new Map<string, number>();
  for (const point of observations)
    for (const dimension of point.dimensions)
      if (dimension.type === 'Sex') sexes.set(dimension.value, dimension.sortOrder);
  if (
    !sexes.size ||
    observations.some((point) => !point.dimensions.some(({ type }) => type === 'Sex'))
  )
    return [{ sex: '', periodType: 'all' as const }];
  const periods: ('1-year' | '3-year')[] = [];
  if (observations.some((point) => !isRollingPeriod(point))) periods.push('1-year');
  if (observations.some(isRollingPeriod)) periods.push('3-year');
  return [...sexes]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .flatMap(([sex]) =>
      (periods.length > 1 ? periods : (['all'] as const)).map((periodType) => ({
        sex,
        periodType,
      })),
    );
}

/** Select the first comparison row at its latest non-null period across the requested areas. */
export function rankingAreaSeries<
  T extends {
    areaCode: string;
    observations: (SortedSeriesObservation & { value: number | null })[];
  },
>(areas: T[]): T[] {
  const observations = areas.find((area) => area.observations.length)?.observations ?? [];
  const local = areas.filter(({ areaCode }) => areaCode !== 'E92000001');
  const compared = local.length ? local : areas;
  for (const variant of comparisonVariants(observations)) {
    const cells = compared.map((area) => ({
      ...area,
      observations: headlineSeries(filterSeries(area.observations, variant)),
    }));
    if (!cells.some((area) => area.observations.length)) continue;
    const latest = cells
      .flatMap((area) => area.observations)
      .filter(({ value }) => value !== null)
      .sort((a, b) => b.toDate.localeCompare(a.toDate) || b.fromDate.localeCompare(a.fromDate))[0];
    const points = new Map(
      cells.map((area) => [
        area.areaCode,
        area.observations.findLast(
          ({ value, fromDate, toDate }) =>
            value !== null && fromDate === latest?.fromDate && toDate === latest?.toDate,
        ),
      ]),
    );
    return areas.map((area) => {
      const point = points.get(area.areaCode);
      return { ...area, observations: point ? [point] : [] };
    });
  }
  return areas.map((area) => ({ ...area, observations: [] }));
}

/** Keep complete headline histories for every table sex/period choice and England's benchmarks. */
export function tableAreaSeries<T extends { areaCode: string; observations: SeriesObservation[] }>(
  areas: T[],
): T[] {
  const selected = areas.map((area) => {
    const sexes = [
      ...new Set(
        area.observations.flatMap(({ dimensions }) =>
          dimensions.filter(({ type }) => type === 'Sex').map(({ value }) => value),
        ),
      ),
    ];
    const groups = [
      area.observations,
      area.observations.filter(({ dimensions }) => !dimensions.some(({ type }) => type === 'Sex')),
      ...sexes.map((sex) =>
        area.observations.filter(({ dimensions }) =>
          dimensions.some(({ type, value }) => type === 'Sex' && value === sex),
        ),
      ),
    ];
    const keep = new Set<SeriesObservation>();
    for (const group of groups) {
      for (const points of [
        group,
        group.filter(isRollingPeriod),
        group.filter((point) => !isRollingPeriod(point)),
      ])
        for (const point of headlineSeries(points)) keep.add(point);
    }
    return { ...area, observations: area.observations.filter((point) => keep.has(point)) };
  });
  const benchmarkSegments = new Set(
    selected.flatMap(({ observations }) => observations.map(observationSegmentKey)),
  );
  return selected.map((area) => {
    if (area.areaCode !== 'E92000001' || areas.length === 1) return area;
    const england = areas.find(({ areaCode }) => areaCode === 'E92000001');
    return {
      ...area,
      observations: (england?.observations ?? []).filter((point) =>
        benchmarkSegments.has(observationSegmentKey(point)),
      ),
    };
  });
}
