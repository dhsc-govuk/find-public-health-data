import type {
  IndicatorAreaData,
  IndicatorDetail,
  IndicatorObservation,
} from '@fphd/public-api-features/contract';
import {
  comparisonVariants,
  ENGLAND_AREA_CODE,
  filterSeries,
  headlineSeries,
  isRollingPeriod,
  observationSegmentKey,
  type TableSeriesSelection,
} from '@fphd/utils/observation-series';
import { periodLabel } from '@fphd/utils/period-label';
import type { PublicYearType } from '@fphd/utils/period-type';
import type { Polarity } from '@fphd/utils/polarity';
import { recentTrendDirection, type TrendDirection } from '@fphd/utils/recent-trend';

export function segmentLabel(observation: IndicatorObservation): string {
  if (observation.dimensions.length === 0) {
    return 'All';
  }
  return observation.dimensions.map((dimension) => dimension.value).join(', ');
}

function segmentKey(observation: IndicatorObservation): string {
  return observationSegmentKey(observation);
}

export function sameSegment(a: IndicatorObservation, b: IndicatorObservation): boolean {
  return (
    a.dimensions.length === b.dimensions.length &&
    a.dimensions.every(
      (dimension, index) =>
        dimension.type === b.dimensions[index]?.type &&
        dimension.value === b.dimensions[index]?.value,
    )
  );
}

/** The observation's dimension values joined the way the range API labels segments:
 *  '|'-separated, ordered by dimension type in code-point order to match the query's
 *  collate "C" — never locale rules, which the two sides could disagree on. */
export function segmentValuesKey(observation: IndicatorObservation): string {
  return [...observation.dimensions]
    .sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))
    .map(({ value }) => value)
    .join('|');
}

/** The direction a polarity calls good; null where neither is. */
export function polarityGoodDirection(polarity: Polarity | null): 'high' | 'low' | null {
  if (polarity === 'higher-is-better') {
    return 'high';
  }
  if (polarity === 'lower-is-better') {
    return 'low';
  }
  return null;
}

export type BenchmarkJudgement = 'better' | 'similar' | 'worse' | 'lower' | 'higher' | 'none';

/**
 * Fingertips semantics: a good direction compares confidence intervals where the comparator
 * method sanctions it, and no polarity says only which side.
 */
export function benchmarkJudgement(
  observation:
    | Pick<IndicatorObservation, 'value' | 'lowerCi95' | 'upperCi95' | 'lowerCi998' | 'upperCi998'>
    | undefined,
  benchmarkValue: number | null,
  indicator: Pick<IndicatorDetail, 'polarity' | 'comparatorMethod'>,
  confidence: '95' | '99.8' = '95',
): BenchmarkJudgement {
  if (observation?.value == null || benchmarkValue == null) {
    return 'none';
  }
  const goodDirection = polarityGoodDirection(indicator.polarity);
  if (!goodDirection) {
    // Where no comparison is possible, not even the side is shown.
    if (indicator.polarity !== 'no-polarity') {
      return 'none';
    }
    if (indicator.comparatorMethod?.toLowerCase().includes('confidence intervals overlapping')) {
      const lower = confidence === '99.8' ? observation.lowerCi998 : observation.lowerCi95;
      const upper = confidence === '99.8' ? observation.upperCi998 : observation.upperCi95;
      if (lower == null || upper == null) return 'none';
      return lower > benchmarkValue ? 'higher' : upper < benchmarkValue ? 'lower' : 'similar';
    }
    if (observation.value === benchmarkValue) {
      return 'similar';
    }
    return observation.value < benchmarkValue ? 'lower' : 'higher';
  }
  if (!indicator.comparatorMethod?.toLowerCase().includes('confidence intervals overlapping')) {
    return 'none';
  }
  const lower = confidence === '99.8' ? observation.lowerCi998 : observation.lowerCi95;
  const upper = confidence === '99.8' ? observation.upperCi998 : observation.upperCi95;
  if (lower == null || upper == null) {
    return 'none';
  }
  if (lower > benchmarkValue) {
    return goodDirection === 'high' ? 'better' : 'worse';
  }
  if (upper < benchmarkValue) {
    return goodDirection === 'low' ? 'better' : 'worse';
  }
  return 'similar';
}

/**
 * The least-disaggregated segment's observations in period order — the closest thing the
 * data has to a headline series. Where several segments tie on dimension count, the one
 * with the most observations wins, as the longest series is the most useful trend.
 */
export function trendSeries(observations: IndicatorObservation[]): IndicatorObservation[] {
  return headlineSeries(observations);
}

/**
 * The trend series aligned to a reference observation's segment. Every column of a
 * table must describe the same population: an always-sexed indicator has no aggregate
 * series, and left to their own devices two areas can settle on different sexes as
 * their "longest" series — a Female column silently compared against a Male benchmark.
 * Falls back to the area's own trend series when it never publishes the reference
 * segment.
 */
export function alignedTrendSeries(
  observations: IndicatorObservation[],
  reference: IndicatorObservation | undefined,
): IndicatorObservation[] {
  if (!reference) {
    return trendSeries(observations);
  }
  const key = segmentKey(reference);
  const matching = observations
    .filter((observation) => segmentKey(observation) === key)
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate) || a.toDate.localeCompare(b.toDate));
  return matching.length > 0 ? matching : trendSeries(observations);
}

const valueFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

export function formatValue(value: number | null): string {
  return value === null ? 'No data' : valueFormat.format(value);
}

const calculatedValueFormat = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Calculated values always show one decimal place ("6.0%"), matching Fingertips. */
export function formatCalculatedValue(value: number | null): string {
  return value === null ? 'No data' : calculatedValueFormat.format(value);
}

/** A value with its unit: "6.0%", "341.1 per 100,000", or the value alone when it has none. */
export function withUnit(value: string, unit: string | null): string {
  if (unit === null) return value;
  return unit === '%' ? `${value}%` : `${value} ${unit}`;
}

/** The unit after a column heading, " (per 100,000)", or nothing when the values have none. */
export function unitNote(unit: string | null): string {
  return unit === null ? '' : ` (${unit})`;
}

export function formatConfidenceInterval(observation: IndicatorObservation): string {
  if (observation.lowerCi95 === null || observation.upperCi95 === null) {
    return '—';
  }
  return `${valueFormat.format(observation.lowerCi95)} to ${valueFormat.format(observation.upperCi95)}`;
}

export interface ComparisonCell {
  trendDirection?: TrendDirection;
  areaCode: string;
  areaName: string;
  value: number | null;
  count: number | null;
  numerator: number | null;
  /** The cell's own series, for the recent-trend calculation. */
  series: IndicatorObservation[];
  /** Note texts attached to the latest value. */
  notes: string[];
}

export interface ComparisonRow {
  shortId: number;
  /** Distinguishes breakout rows of one indicator ("Female, 1 year"). */
  key: string;
  name: string;
  suffix: string;
  unit: string | null;
  areaName: string;
  period: string;
  value: number | null;
  count: number | null;
  numerator: number | null;
  series: IndicatorObservation[];
  notes: string[];
  /** The variant behind a breakout row, so a benchmark can be filtered the same way. */
  sex: string;
  periodType: PeriodType;
  /** One cell per compared area, aligned with comparisonAreas(). */
  cells: ComparisonCell[];
}

/**
 * The areas the comparison table sets side by side: every selected area, except that
 * England steps back once real areas are picked — the same rule as the trend table.
 */
export function comparisonAreas(areaData: IndicatorAreaData[]): IndicatorAreaData[] {
  const nonEngland = areaData.filter(({ areaCode }) => areaCode !== ENGLAND_AREA_CODE);
  return nonEngland.length > 0 ? nonEngland : areaData;
}

const PERIOD_TYPE_SUFFIX: Record<Exclude<PeriodType, 'all'>, string> = {
  '1-year': '1 year',
  '3-year': '3 year rolling average',
};

/**
 * The comparison table's rows: normally one per indicator (its least-disaggregated
 * series), but an indicator that is always sexed has no such aggregate, so it breaks out
 * one row per sex — and per period shape where it publishes both, as life expectancy
 * does. Indicators with no data still get a row rather than vanishing.
 */
export function comparisonRows(
  selected: {
    detail: IndicatorDetail;
    areaData: IndicatorAreaData[];
    tableSeries?: TableSeriesSelection[];
  }[],
): ComparisonRow[] {
  return selected.flatMap(({ detail, areaData, tableSeries }) => {
    const first = areaData[0];
    const source = areaData.find(({ observations }) => observations.length > 0);
    const observations = source?.observations ?? [];
    const storedVariants = source
      ? tableSeries
          ?.filter((series) => series.rowOrder?.[source.areaCode] !== undefined)
          .sort(
            (a, b) => (a.rowOrder?.[source.areaCode] ?? 0) - (b.rowOrder?.[source.areaCode] ?? 0),
          )
      : undefined;
    const variants = (
      storedVariants?.length ? storedVariants : comparisonVariants(observations)
    ).map(({ sex, periodType }) => ({
      sex,
      periodType,
      suffix: !sex
        ? ''
        : periodType === 'all'
          ? `(${sex})`
          : `(${sex}, ${PERIOD_TYPE_SUFFIX[periodType]})`,
    }));

    const areas = comparisonAreas(areaData);
    const cellFor = (data: IndicatorAreaData, variant: (typeof variants)[number]) => {
      const points = filterObservations(data.observations, {
        sex: variant.sex,
        periodType: variant.periodType,
      });
      const selection = tableSeries?.find(
        (entry) => entry.sex === variant.sex && entry.periodType === variant.periodType,
      );
      const series = selection
        ? points.filter(
            (point) => observationSegmentKey(point) === selection.segments[data.areaCode],
          )
        : trendSeries(points);
      const latest = series.at(-1);
      const trendDirection = selection?.trends?.[data.areaCode];
      return {
        ...(trendDirection !== undefined ? { trendDirection } : {}),
        areaCode: data.areaCode,
        areaName: data.areaName,
        value: latest?.value ?? null,
        count: latest?.count ?? null,
        numerator: latest?.numerator ?? null,
        series,
        notes: latest?.notes.map(({ text }) => text) ?? [],
      };
    };

    const rows = variants.flatMap((variant) => {
      const cells = areas.map((data) => cellFor(data, variant));
      const firstWithData = cells.find(({ series }) => series.length > 0);
      const latest = firstWithData?.series.at(-1);
      if (!latest) {
        return [];
      }
      return [
        {
          shortId: detail.shortId,
          key: `${detail.shortId}|${variant.suffix}`,
          name: detail.name,
          suffix: variant.suffix,
          unit: detail.unit,
          areaName: firstWithData?.areaName ?? '',
          period: periodLabel(latest, detail.yearType),
          value: firstWithData?.value ?? null,
          count: firstWithData?.count ?? null,
          numerator: firstWithData?.numerator ?? null,
          series: firstWithData?.series ?? [],
          notes: firstWithData?.notes ?? [],
          sex: variant.sex,
          periodType: variant.periodType,
          cells,
        },
      ];
    });

    return rows.length > 0
      ? rows
      : [
          {
            shortId: detail.shortId,
            key: String(detail.shortId),
            name: detail.name,
            suffix: '',
            unit: detail.unit,
            areaName: first?.areaName ?? '',
            period: '',
            value: null,
            count: null,
            numerator: null,
            series: [],
            notes: [],
            sex: '',
            periodType: 'all' as PeriodType,
            cells: areas.map((data) => cellFor(data, { sex: '', periodType: 'all', suffix: '' })),
          },
        ];
  });
}

/**
 * The latest period's values broken down by an inequality dimension (deprivation,
 * ethnicity, and the like) rather than the core sex/age segmentation. One dimension only:
 * mixing several in a single table would compare values that are not comparable.
 */
export function inequalitySegments(observations: IndicatorObservation[]): IndicatorObservation[] {
  const withInequality = observations.filter((observation) =>
    observation.dimensions.some(({ dimensionClass }) => dimensionClass === 'inequality'),
  );
  if (withInequality.length === 0) {
    return [];
  }

  const latestToDate = withInequality
    .map(({ toDate }) => toDate)
    .sort()
    .at(-1);
  const latest = withInequality.filter(({ toDate }) => toDate === latestToDate);
  const latestFromDate = latest
    .map(({ fromDate }) => fromDate)
    .sort()
    .at(-1);
  const period = latest.filter(({ fromDate }) => fromDate === latestFromDate);

  // Whichever inequality dimension has the most values in that period is the one with a
  // story to tell; the others would each render a table of one or two rows.
  const counts = new Map<string, number>();
  for (const observation of period) {
    for (const { type, dimensionClass } of observation.dimensions) {
      if (dimensionClass === 'inequality') {
        counts.set(type, (counts.get(type) ?? 0) + 1);
      }
    }
  }
  const [chosen] =
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];

  return period
    .filter((observation) => observation.dimensions.some(({ type }) => type === chosen))
    .sort(
      (a, b) =>
        a.dimensions.reduce((sum, d) => sum + d.sortOrder, 0) -
          b.dimensions.reduce((sum, d) => sum + d.sortOrder, 0) ||
        segmentLabel(a).localeCompare(segmentLabel(b)),
    );
}

export type PeriodType = 'all' | '1-year' | '3-year';

/** A period spanning appreciably more than a year is a rolling average. */
function isRolling({ fromDate, toDate }: IndicatorObservation): boolean {
  return isRollingPeriod({ fromDate, toDate });
}

export function periodTypeLabel(periodType: PeriodType): string {
  return periodType === '1-year' ? '1 year' : periodType === '3-year' ? '3 year rolling' : 'All';
}

/**
 * The period shapes an indicator actually publishes. Many indicators are single-year
 * only (QOF prevalence) or rolling only (life expectancy), so the period filter must
 * offer just the shapes present or a choice can never match anything.
 */
export function availablePeriodTypes(observations: IndicatorObservation[]): PeriodType[] {
  const types: PeriodType[] = [];
  if (observations.some((observation) => !isRolling(observation))) {
    types.push('1-year');
  }
  if (observations.some(isRolling)) {
    types.push('3-year');
  }
  return types;
}

/** The distinct values of one dimension across an indicator's observations, in sort order. */
export function dimensionValues(
  observations: IndicatorObservation[],
  dimensionType: string,
): string[] {
  const bySortOrder = new Map<string, number>();
  for (const observation of observations) {
    for (const dimension of observation.dimensions) {
      if (dimension.type === dimensionType) {
        bySortOrder.set(dimension.value, dimension.sortOrder);
      }
    }
  }
  return [...bySortOrder.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([value]) => value);
}

export interface ObservationFilter {
  sex?: string;
  periodType?: PeriodType;
}

/**
 * Narrows observations to what the chart and table options ask for. Choosing a sex keeps
 * only that sex's observations — the sexless all-people series would otherwise always win
 * as the least-disaggregated segment and the selection would appear to do nothing.
 */
export function filterObservations(
  observations: IndicatorObservation[],
  { sex, periodType = 'all' }: ObservationFilter,
): IndicatorObservation[] {
  return filterSeries(observations, { ...(sex ? { sex } : {}), periodType });
}

export type ConfidenceLevel = 'none' | '95' | '99.8';

/** The raw numbers an observation may carry beside its value, as tables label them. */
export const MEASURES = [
  { key: 'count', label: 'Count' },
  { key: 'numerator', label: 'Numerator' },
] as const;

export type Measure = (typeof MEASURES)[number]['key'];

/** The raw numbers any of the observations has, which are the columns a table offers. */
export function availableMeasures(observations: Pick<IndicatorObservation, Measure>[]): Measure[] {
  return MEASURES.map(({ key }) => key).filter((key) =>
    observations.some((observation) => observation[key] != null),
  );
}

/** The interval levels the data actually carries; the filter offers nothing emptier. */
export function availableConfidenceLevels(
  observations: IndicatorObservation[],
): Exclude<ConfidenceLevel, 'none'>[] {
  const levels: Exclude<ConfidenceLevel, 'none'>[] = [];
  if (observations.some(({ lowerCi95, upperCi95 }) => lowerCi95 !== null || upperCi95 !== null)) {
    levels.push('95');
  }
  if (
    observations.some(({ lowerCi998, upperCi998 }) => lowerCi998 !== null || upperCi998 !== null)
  ) {
    levels.push('99.8');
  }
  return levels;
}

export function confidenceInterval(
  observation: IndicatorObservation,
  level: ConfidenceLevel,
): string {
  if (level === 'none') {
    return '';
  }
  const lower = level === '95' ? observation.lowerCi95 : observation.lowerCi998;
  const upper = level === '95' ? observation.upperCi95 : observation.upperCi998;
  if (lower === null || upper === null || lower === undefined || upper === undefined) {
    return '—';
  }
  return `${valueFormat.format(lower)} to ${valueFormat.format(upper)}`;
}

/** Every inequality dimension an indicator reports, for the category chooser. */
export function inequalityCategories(observations: IndicatorObservation[]): string[] {
  const types = new Set<string>();
  for (const observation of observations) {
    for (const { type, dimensionClass } of observation.dimensions) {
      if (dimensionClass === 'inequality') {
        types.add(type);
      }
    }
  }
  return [...types].sort((a, b) => {
    const withoutGeography = (type: string) => type.replace(/,\s*\d+\/\d+ geography/, '');
    const family = withoutGeography(a).localeCompare(withoutGeography(b));
    if (family) return family;
    const boundary = (type: string) => {
      const match = type.match(/,\s*(\d+)\/(\d+) geography/);
      return match ? Number(match[2]) * 12 + Number(match[1]) : 0;
    };
    return boundary(b) - boundary(a);
  });
}

/**
 * Purely this category's breakdown of the indicator's own baseline segment: beyond the
 * category dimension, only the dimensions the headline series always carries (QOF
 * prevalence's "Age 17+", a wholly-sexed indicator's aligned sex) may appear. A decile
 * split further by sex belongs to a combined view not offered here.
 */
function isPureCategory(
  observation: IndicatorObservation,
  category: string,
  reference: IndicatorObservation | undefined,
): boolean {
  const rest = observation.dimensions.filter(({ type }) => type !== category);
  if (rest.length === observation.dimensions.length) {
    return false;
  }
  const baseline = reference?.dimensions ?? [];
  return (
    rest.length === baseline.length &&
    rest.every(({ type, value }) =>
      baseline.some((dimension) => dimension.type === type && dimension.value === value),
    )
  );
}

/**
 * Pholio's inequality dimension names carry internal qualifiers ("in England", "4/23
 * geography") that are stripped for display. Where shortening makes two categories
 * collide (the same deciles across boundary revisions), the geography qualifier stays
 * as the differentiator.
 */
function deprivationBoundary(type: string) {
  const match = type.match(
    /^(County|District) & UA deprivation deciles in England \(IMD(\d{4}), (\d+)\/(\d+) geography\)$/,
  );
  if (!match) return undefined;
  const [, tier, year, month, boundaryYear] = match;
  const boundary = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000 + Number(boundaryYear), Number(month) - 1)));
  return { tier, year, boundary };
}

export function inequalityCategoryLabel(type: string, keepGeography = false): string {
  const qualifier = deprivationBoundary(type);
  if (qualifier) {
    const { tier, year, boundary } = qualifier;
    return `${tier === 'County' ? 'Counties' : 'Districts'} and unitary authorities by deprivation (IMD ${year}, ${boundary} boundaries)`;
  }
  const label = type
    .replace('County & UA', 'County and unitary authority')
    .replace('District & UA', 'District and unitary authority')
    .replace(' in England', '')
    .replace(' within area', '');
  return keepGeography ? label : label.replace(/,\s*\d+\/\d+ geography/, '');
}

export function inequalityCategoryHint(type: string): string | undefined {
  const qualifier = deprivationBoundary(type);
  if (!qualifier) return undefined;
  const { tier, year, boundary } = qualifier;
  const areas =
    tier === 'County'
      ? 'upper tier local authorities (counties and unitary authorities'
      : 'lower tier local authorities (districts and unitary authorities';
  return `We sort ${areas}, ${boundary} boundaries) by deprivation (Index of Multiple Deprivation ${year}) and split them into 10 equal groups (deciles). Decile 1 is the most deprived 10%. Decile 10 is the least deprived 10%.`;
}

export function inequalityValueLabel(observation: IndicatorObservation): string {
  const dimension = observation.dimensions.find(
    ({ dimensionClass }) => dimensionClass === 'inequality',
  );
  if (!dimension) return segmentLabel(observation);
  const year = dimension.type.includes('deprivation deciles')
    ? dimension.type.match(/\(IMD\s*(\d{4})/)?.[1]
    : undefined;
  const decile = dimension.sortOrder;
  if (!year || decile < 1 || decile > 10) return dimension.value;
  return `Decile ${decile} (${decile === 1 ? 'most deprived, ' : decile === 10 ? 'least deprived, ' : ''}IMD ${year})`;
}

/** The category select's options, disambiguated where shortened labels collide. */
export function inequalityCategoryOptions(
  categories: string[],
): { label: string; value: string }[] {
  const counts = new Map<string, number>();
  for (const value of categories) {
    const label = inequalityCategoryLabel(value);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return categories.map((value) => {
    const label = inequalityCategoryLabel(value);
    return {
      label: (counts.get(label) ?? 0) > 1 ? inequalityCategoryLabel(value, true) : label,
      value,
    };
  });
}

/** The periods an indicator reports for one inequality category, most recent last. */
export function inequalityPeriods(
  observations: IndicatorObservation[],
  category: string,
  yearType?: PublicYearType | null,
): { value: string; label: string }[] {
  const reference = trendSeries(observations)[0];
  const periods = new Map<string, string>();
  for (const observation of observations) {
    if (isPureCategory(observation, category, reference)) {
      periods.set(
        `${observation.fromDate}/${observation.toDate}`,
        periodLabel(observation, yearType),
      );
    }
  }
  return [...periods.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, label]) => ({ value, label }));
}

/** One inequality category's values for one period, in the dimension's own order. */
export function inequalityBreakdown(
  observations: IndicatorObservation[],
  category: string,
  period: string,
): IndicatorObservation[] {
  const reference = trendSeries(observations)[0];
  return observations
    .filter(
      (observation) =>
        `${observation.fromDate}/${observation.toDate}` === period &&
        isPureCategory(observation, category, reference),
    )
    .sort(
      (a, b) =>
        a.dimensions.reduce((sum, d) => sum + d.sortOrder, 0) -
          b.dimensions.reduce((sum, d) => sum + d.sortOrder, 0) ||
        segmentLabel(a).localeCompare(segmentLabel(b)),
    );
}

/**
 * The time an indicator's data covers, as the summary table shows it: from the start of the first
 * period to the end of the last, labelled like any other period.
 */
export function periodCovered(
  observations: IndicatorObservation[],
  yearType?: PublicYearType | null,
): string {
  const [first, ...rest] = observations;
  if (first === undefined) {
    return '';
  }
  const span = rest.reduce(
    (covered, { fromDate, toDate }) => ({
      // biome-ignore lint/complexity/useMathMinMax: ISO date strings, which Math.min turns into NaN.
      fromDate: fromDate < covered.fromDate ? fromDate : covered.fromDate,
      // biome-ignore lint/complexity/useMathMinMax: ISO date strings, which Math.max turns into NaN.
      toDate: toDate > covered.toDate ? toDate : covered.toDate,
    }),
    { fromDate: first.fromDate, toDate: first.toDate },
  );
  return periodLabel(span, yearType);
}

export type RecentTrend =
  | { direction: 'up' | 'down'; label: string; tone: 'green' | 'red' | 'blue' }
  | { direction: 'right'; label: string; tone: 'yellow' }
  | {
      direction: null;
      label: string;
      tone: 'grey';
      reason: 'multi-year periods' | 'not enough data points';
    };

/**
 * Direction of the latest five aggregate values, read with the indicator's polarity so
 * the tag can say whether the movement is good. A change smaller than 2% of the series
 * mean is reported as no significant change rather than a trend.
 */
export function recentTrend(
  observations: IndicatorObservation[],
  polarity: Polarity | null,
  precomputed?: TrendDirection,
): RecentTrend {
  const series = trendSeries(observations);
  if (series.some(isRollingPeriod))
    return {
      direction: null,
      label: 'Trend unavailable',
      tone: 'grey',
      reason: 'multi-year periods',
    };
  const direction =
    precomputed === undefined
      ? recentTrendDirection(series.map(({ value }) => value))
      : precomputed;
  if (direction === null)
    return {
      direction: null,
      label: 'Trend unavailable',
      tone: 'grey',
      reason: 'not enough data points',
    };
  if (direction === 'right') return { direction, label: 'No significant change', tone: 'yellow' };
  const goodDirection = polarityGoodDirection(polarity);
  const word = direction === 'up' ? 'Increasing' : 'Decreasing';
  if (!goodDirection) {
    return { direction, label: word, tone: 'blue' };
  }
  const better = (direction === 'down') === (goodDirection === 'low');
  return {
    direction,
    label: `${word} and getting ${better ? 'better' : 'worse'}`,
    tone: better ? 'green' : 'red',
  };
}
