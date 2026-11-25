import { isoDurationDays } from './age-range.ts';
import { recentTrendDirection, type TrendDirection } from './recent-trend.ts';

export const OBSERVATION_SERIES_VERSION = 6;
export const ENGLAND_AREA_CODE = 'E92000001';
export const SEX_DIMENSION_NAME = 'Sex';
export type ObservationPeriodType = `${number}-year` | `${number}-month` | `${number}-day`;
export type SeriesPeriodType = 'all' | ObservationPeriodType;

export function isObservationPeriodType(value: unknown): value is ObservationPeriodType {
  return (
    typeof value === 'string' &&
    /^[1-9]\d*-(year|month|day)$/.test(value) &&
    Number.isSafeInteger(Number.parseInt(value, 10))
  );
}
export const AGE_DIMENSION_NAME = 'Age';
export const ROLLING_PERIOD_THRESHOLD_DAYS = 400;

interface SeriesObservation {
  fromDate: string;
  toDate: string;
  dimensions: {
    type: string;
    value: string;
    ageFrom?: string | undefined;
    ageUnder?: string | undefined;
  }[];
}

export function observationSegmentKey(observation: SeriesObservation): string {
  return [...observation.dimensions]
    .sort((a, b) => compareKeys(a.type, b.type))
    .map(({ type, value }) => `${type}:${value}`)
    .join('|');
}

function addMonthsClamped(start: Date, months: number): Date {
  const result = new Date(start);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months + 1);
  result.setUTCDate(0);
  result.setUTCDate(Math.min(start.getUTCDate(), result.getUTCDate()));
  return result;
}

export function periodMonths(
  observation: Pick<SeriesObservation, 'fromDate' | 'toDate'>,
): number | null {
  const start = new Date(observation.fromDate);
  const inclusiveEnd = new Date(observation.toDate);
  const end = new Date(Date.parse(observation.toDate) + 86_400_000);
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  if (months > 0 && addMonthsClamped(start, months).getTime() === end.getTime()) return months;
  if (
    months > 1 &&
    start.getUTCDate() > inclusiveEnd.getUTCDate() &&
    addMonthsClamped(start, months - 1).getTime() === inclusiveEnd.getTime()
  )
    return months - 1;
  return null;
}

export function periodYears(
  observation: Pick<SeriesObservation, 'fromDate' | 'toDate'>,
): number | null {
  const months = periodMonths(observation);
  return months !== null && months % 12 === 0 ? months / 12 : null;
}

export function observationPeriodType(
  observation: Pick<SeriesObservation, 'fromDate' | 'toDate'>,
): ObservationPeriodType {
  const months = periodMonths(observation);
  const days = (Date.parse(observation.toDate) - Date.parse(observation.fromDate)) / 86_400_000 + 1;
  if (months === null) return `${days}-day`;
  return months % 12 === 0 ? `${months / 12}-year` : `${months}-month`;
}

export function periodTypeLength(periodType: ObservationPeriodType): number {
  return (
    Number.parseInt(periodType, 10) *
    (periodType.endsWith('-year') ? 365.25 : periodType.endsWith('-month') ? 30.4375 : 1)
  );
}

export function seriesPeriodTypes(
  observations: Pick<SeriesObservation, 'fromDate' | 'toDate'>[],
): ObservationPeriodType[] {
  return [...new Set(observations.map(observationPeriodType))].sort(
    (a, b) => periodTypeLength(a) - periodTypeLength(b),
  );
}

export function isRollingPeriod(
  observation: Pick<SeriesObservation, 'fromDate' | 'toDate'>,
): boolean {
  return periodTypeLength(observationPeriodType(observation)) > 365.25;
}

export function observationSeriesKey(observation: SeriesObservation): string {
  return `${observationSegmentKey(observation)}|${observationPeriodType(observation)}`;
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * How an observation's age ranks for the headline, higher first: an age with no upper limit, the
 * earlier start first, then a closed range, the longer first, then no age range at all.
 * `ageRankSql` in `@fphd/db` is the same rule in SQL.
 */
export function ageRank({ dimensions }: SeriesObservation): [number, number] {
  for (const { ageFrom, ageUnder } of dimensions) {
    const from = ageFrom === undefined ? undefined : isoDurationDays(ageFrom);
    if (from === undefined) continue;
    if (ageUnder === undefined) return [1, -from];
    const under = isoDurationDays(ageUnder);
    if (under !== undefined) return [0, under - from];
  }
  return [-1, 0];
}

/**
 * The series a page shows for a set of observations: the segment with the fewest dimensions other
 * than age, then the newest period, suppressed or not, then the fewest dimensions, then the widest
 * age (see `ageRank`), then the most points, then the longest period type, then the earliest first
 * point, then the dimension key (type name, then the input order of values with that type). Each
 * segment shares a dimension key and a calendar-based period type. `headlineOrder` in `@fphd/db`
 * is the same rule in SQL, with the dimension key supplied by its callers.
 */
export function headlineSeries<T extends SeriesObservation>(observations: T[]): T[] {
  const segments = new Map<
    string,
    {
      points: T[];
      others: number;
      latest: string;
      dimensions: number;
      age: [number, number];
      first: string;
      periodLength: number;
      dimensionKey: string;
    }
  >();
  for (const point of observations) {
    const key = observationSeriesKey(point);
    const segment = segments.get(key) ?? {
      points: [],
      others: point.dimensions.filter(({ type }) => type !== AGE_DIMENSION_NAME).length,
      latest: '',
      dimensions: point.dimensions.length,
      age: ageRank(point),
      first: `${point.fromDate}:${point.toDate}`,
      periodLength: periodTypeLength(observationPeriodType(point)),
      dimensionKey: observationSegmentKey(point),
    };
    segment.points.push(point);
    if (point.toDate > segment.latest) segment.latest = point.toDate;
    const first = `${point.fromDate}:${point.toDate}`;
    if (first < segment.first) segment.first = first;
    segments.set(key, segment);
  }
  const [winner] = [...segments.values()].sort(
    (a, b) =>
      a.others - b.others ||
      b.latest.localeCompare(a.latest) ||
      a.dimensions - b.dimensions ||
      b.age[0] - a.age[0] ||
      b.age[1] - a.age[1] ||
      b.points.length - a.points.length ||
      b.periodLength - a.periodLength ||
      compareKeys(a.first, b.first) ||
      compareKeys(a.dimensionKey, b.dimensionKey),
  );
  return (winner?.points ?? []).sort(
    (a, b) => a.fromDate.localeCompare(b.fromDate) || a.toDate.localeCompare(b.toDate),
  );
}

/**
 * Whether the age of a series chosen by `headlineSeries` may be only part of the indicator's
 * population. It is safe when the series has no age, or when every other series that differs from
 * it only by age has an age inside the chosen one. A series with no age, or with an age outside
 * the chosen one, means the headline rule may have picked a part over the whole.
 */
export function uncertainHeadlineAge(
  observations: Pick<SeriesObservation, 'dimensions'>[],
  headline: Pick<SeriesObservation, 'dimensions'>,
): boolean {
  type Series = Pick<SeriesObservation, 'dimensions'>;
  const ageOf = ({ dimensions }: Series) =>
    dimensions.find(({ type }) => type === AGE_DIMENSION_NAME);
  const otherDimensions = ({ dimensions }: Series) =>
    observationSegmentKey({
      fromDate: '',
      toDate: '',
      dimensions: dimensions.filter(({ type }) => type !== AGE_DIMENSION_NAME),
    });
  const days = (duration: string | undefined) =>
    duration === undefined ? undefined : isoDurationDays(duration);
  const age = ageOf(headline);
  if (!age) return false;
  const from = days(age.ageFrom);
  const under = days(age.ageUnder);
  const inside = (point: Series) => {
    const other = ageOf(point);
    if (!other) return false;
    if (other.value === age.value) return true;
    const otherFrom = days(other.ageFrom);
    if (from === undefined || otherFrom === undefined || otherFrom < from) return false;
    if (age.ageUnder === undefined) return true;
    const otherUnder = days(other.ageUnder);
    return under !== undefined && otherUnder !== undefined && otherUnder <= under;
  };
  const group = otherDimensions(headline);
  return observations.some((point) => otherDimensions(point) === group && !inside(point));
}

export interface SeriesFilter {
  sex?: string;
  periodType?: SeriesPeriodType;
}

export interface TableSeriesSelection {
  sex: string;
  periodType: SeriesPeriodType;
  segments: Record<string, string>;
  trends?: Record<string, TrendDirection>;
  rowOrder?: Record<string, number>;
  headlines?: Record<string, boolean>;
}

export function filterSeries<T extends SeriesObservation>(
  observations: T[],
  { sex, periodType = 'all' }: SeriesFilter,
): T[] {
  return observations.filter(
    (point) =>
      (periodType === 'all' || observationPeriodType(point) === periodType) &&
      (!sex ||
        point.dimensions.some(({ type, value }) => type === SEX_DIMENSION_NAME && value === sex)),
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
        point.dimensions
          .filter(({ type }) => type === SEX_DIMENSION_NAME)
          .map(({ value }) => value),
      ),
    ),
  ]);
  const tableSeries: TableSeriesSelection[] = [];
  const keep = new Set<SeriesObservation>();
  const england = areas.find(({ areaCode }) => areaCode === ENGLAND_AREA_CODE);
  const variantsByArea = new Map(
    areas.map((area) => [area.areaCode, comparisonVariants(area.observations)]),
  );
  for (const sex of sexes) {
    for (const periodType of [
      'all',
      ...seriesPeriodTypes(areas.flatMap(({ observations }) => observations)),
    ] as const) {
      const trends: Record<string, TrendDirection> = {};
      const rowOrder: Record<string, number> = {};
      const headlines: Record<string, boolean> = {};
      const selection: TableSeriesSelection = {
        sex,
        periodType,
        segments: {},
        trends,
        rowOrder,
        headlines,
      };
      for (const area of areas) {
        const order =
          variantsByArea
            .get(area.areaCode)
            ?.findIndex((variant) => variant.sex === sex && variant.periodType === periodType) ??
          -1;
        if (order < 0 && (sex !== '' || periodType !== 'all')) continue;
        if (order >= 0) rowOrder[area.areaCode] = order;
        const series = headlineSeries(filterSeries(area.observations, selection));
        const latest = series.at(-1);
        if (!latest) continue;
        selection.segments[area.areaCode] = observationSeriesKey(latest);
        const headline = headlineSeries(area.observations)[0];
        if (headline && observationSeriesKey(headline) === observationSeriesKey(latest))
          headlines[area.areaCode] = true;
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
      if (dimension.type === SEX_DIMENSION_NAME) sexes.set(dimension.value, dimension.sortOrder);
  if (
    !sexes.size ||
    observations.some((point) => !point.dimensions.some(({ type }) => type === SEX_DIMENSION_NAME))
  )
    return [{ sex: '', periodType: 'all' as const }];
  const periods = seriesPeriodTypes(observations);
  return [...sexes]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .flatMap(([sex]) =>
      (periods.length > 1
        ? seriesPeriodTypes(filterSeries(observations, { sex }))
        : (['all'] as const)
      ).map((periodType) => ({
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
  const local = areas.filter(({ areaCode }) => areaCode !== ENGLAND_AREA_CODE);
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
      const point =
        area.areaCode === ENGLAND_AREA_CODE && local.length
          ? filterSeries(area.observations, variant).findLast(
              (point) =>
                latest &&
                observationSegmentKey(point) === observationSegmentKey(latest) &&
                point.fromDate === latest.fromDate &&
                point.toDate === latest.toDate,
            )
          : points.get(area.areaCode);
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
          dimensions.filter(({ type }) => type === SEX_DIMENSION_NAME).map(({ value }) => value),
        ),
      ),
    ];
    const groups = [
      area.observations,
      area.observations.filter(
        ({ dimensions }) => !dimensions.some(({ type }) => type === SEX_DIMENSION_NAME),
      ),
      ...sexes.map((sex) =>
        area.observations.filter(({ dimensions }) =>
          dimensions.some(({ type, value }) => type === SEX_DIMENSION_NAME && value === sex),
        ),
      ),
    ];
    const keep = new Set<SeriesObservation>();
    for (const group of groups) {
      for (const points of [
        group,
        ...seriesPeriodTypes(group).map((periodType) => filterSeries(group, { periodType })),
      ])
        for (const point of headlineSeries(points)) keep.add(point);
    }
    return { ...area, observations: area.observations.filter((point) => keep.has(point)) };
  });
  const benchmarkSegments = new Set(
    selected.flatMap(({ observations }) => observations.map(observationSegmentKey)),
  );
  return selected.map((area) => {
    if (area.areaCode !== ENGLAND_AREA_CODE || areas.length === 1) return area;
    const england = areas.find(({ areaCode }) => areaCode === ENGLAND_AREA_CODE);
    return {
      ...area,
      observations: (england?.observations ?? []).filter((point) =>
        benchmarkSegments.has(observationSegmentKey(point)),
      ),
    };
  });
}

export interface ScatterObservation extends SeriesObservation {
  value: number | null;
  dimensions: { type: string; value: string; sortOrder?: number }[];
}

export interface ScatterArea {
  areaCode: string;
  areaName: string;
  observations: ScatterObservation[];
}

export function pairedAreaValues(xAreas: ScatterArea[], yAreas: ScatterArea[]) {
  const samePopulation = (a: ScatterObservation, b: ScatterObservation) =>
    a.dimensions.length === b.dimensions.length &&
    a.dimensions.every(
      (dimension, index) =>
        dimension.type === b.dimensions[index]?.type &&
        dimension.value === b.dimensions[index]?.value,
    );

  const aligned = (areas: ScatterArea[]) => {
    const first = areas.find(({ observations }) =>
      observations.some(({ value }) => value !== null),
    );
    const reference = first && headlineSeries(first.observations)[0];
    return areas.map(({ areaCode, areaName, observations }) => ({
      code: areaCode,
      name: areaName,
      observations: new Map(
        observations
          .filter((point) => reference && samePopulation(point, reference))
          .map((point) => [`${point.fromDate}|${point.toDate}`, point]),
      ),
    }));
  };
  const latest = (observations: Map<string, ScatterObservation>) =>
    [...observations.values()]
      .filter(({ value }) => value !== null)
      .sort((a, b) => a.toDate.localeCompare(b.toDate) || a.fromDate.localeCompare(b.fromDate))
      .at(-1);
  const ySeries = new Map(aligned(yAreas).map((area) => [area.code, latest(area.observations)]));
  return aligned(xAreas).flatMap(({ code, name, observations }) => {
    const x = latest(observations);
    const y = ySeries.get(code);
    return x?.value == null || y?.value == null
      ? []
      : [
          {
            code,
            name,
            xPeriod: { fromDate: x.fromDate, toDate: x.toDate },
            yPeriod: { fromDate: y.fromDate, toDate: y.toDate },
            x: x.value,
            y: y.value,
          },
        ];
  });
}

export function pairedAreaSexValues(xAreas: ScatterArea[], yAreas: ScatterArea[]) {
  const pair = [xAreas, yAreas];
  const sexesByIndicator = pair.map((areas) => {
    const sexes = new Map<string, number>();
    for (const { observations } of areas)
      for (const { dimensions } of observations)
        for (const dimension of dimensions)
          if (dimension.type === SEX_DIMENSION_NAME)
            sexes.set(dimension.value, dimension.sortOrder ?? 0);
    return [...sexes].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([sex]) => sex);
  });
  const sexes = (sexesByIndicator.find((values) => values.length) ?? []).filter((sex) =>
    sexesByIndicator.every((values) => !values.length || values.includes(sex)),
  );
  sexes.sort((a, b) => (a === 'Female' ? -1 : b === 'Female' ? 1 : 0));
  const variants = sexes.map((sex) => {
    const areas = pair.map((areas, index) =>
      areas.map((area) => ({
        ...area,
        observations: area.observations
          .filter(
            ({ dimensions }) =>
              !sexesByIndicator[index]?.length ||
              dimensions.some(
                (dimension) => dimension.type === SEX_DIMENSION_NAME && dimension.value === sex,
              ),
          )
          .map((point) => ({
            ...point,
            dimensions: point.dimensions.filter(({ type }) => type !== SEX_DIMENSION_NAME),
          })),
      })),
    );
    return {
      sex,
      axisSexes: sexesByIndicator.map((values) => (values.length ? sex : '')),
      points: pairedAreaValues(areas[0] ?? [], areas[1] ?? []),
    };
  });
  return { points: pairedAreaValues(xAreas, yAreas), variants };
}
