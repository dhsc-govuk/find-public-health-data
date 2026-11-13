import type { BenchmarkChoice } from './comparison.ts';
import { alignedTrendSeries, type ConfidenceLevel, segmentValuesKey, trendSeries } from './data.ts';
import type {
  BenchmarkGeography,
  IndicatorAreaData,
  IndicatorObservation,
  IndicatorRangePeriod,
} from './loader.ts';

export interface AreaBenchmark {
  name: string;
  /** The benchmark as the comparison chart's heading names it: "Compared with <label>". */
  label: string;
  series: IndicatorObservation[];
  rangePeriods: IndicatorRangePeriod[];
}

export interface TrendColumns {
  count: boolean;
  numerator: boolean;
  value: boolean;
  confidence: ('95' | '99.8')[];
  /** The lowest and highest values across the benchmark's areas. */
  minMax: boolean;
  /** The 25th and 75th percentiles across the benchmark's areas. */
  percentiles: boolean;
  /** The chart comparing each value with the benchmark and its spread. */
  chart: boolean;
}

/** The benchmark spread columns, shown by default whenever a benchmark is chosen. */
const RANGE_COLUMNS = ['minmax', 'percentiles', 'chart'];

/** The chosen columns among those available: the measures and confidence levels the data has. */
export function selectedTrendColumns(
  params: URLSearchParams,
  id: number,
  available: string[],
): TrendColumns {
  const key = `columns-${id}`;
  const values = params.has(key)
    ? params.getAll(key).flatMap((value) => value.split(','))
    : [
        'value',
        ...RANGE_COLUMNS,
        ...(params.has(`ci-${id}`)
          ? params.getAll(`ci-${id}`)
          : available.includes('95')
            ? ['95']
            : available.includes('99.8')
              ? ['99.8']
              : []),
      ];
  return {
    count: available.includes('count') && values.includes('count'),
    numerator: available.includes('numerator') && values.includes('numerator'),
    value: values.includes('value'),
    confidence: (['95', '99.8'] as const).filter(
      (level) => available.includes(level) && values.includes(level),
    ),
    minMax: values.includes('minmax'),
    percentiles: values.includes('percentiles'),
    chart: values.includes('chart'),
  };
}

/** The columns as the `columns-<id>` parameter holds them, `none` when none is chosen. */
export function trendColumnsParam(columns: TrendColumns): string {
  return (
    [
      columns.count ? 'count' : '',
      columns.numerator ? 'numerator' : '',
      columns.value ? 'value' : '',
      ...columns.confidence,
      columns.minMax ? 'minmax' : '',
      columns.percentiles ? 'percentiles' : '',
      columns.chart ? 'chart' : '',
    ]
      .filter(Boolean)
      .join(',') || 'none'
  );
}

export function trendTableModel({
  areaData,
  benchmark = 'none',
  confidence,
  geography = { regionByCode: {}, levelByCode: {} },
  ranges = {},
  regionData = [],
}: {
  areaData: IndicatorAreaData[];
  benchmark?: BenchmarkChoice;
  confidence: ConfidenceLevel;
  geography?: BenchmarkGeography;
  ranges?: Record<string, IndicatorRangePeriod[]>;
  regionData?: IndicatorAreaData[];
}) {
  const nonEngland = areaData.filter(({ areaCode }) => areaCode !== 'E92000001');
  const england = areaData.filter(({ areaCode }) => areaCode === 'E92000001');
  const shownAreas = nonEngland.length === 0 ? areaData : nonEngland;
  const benchmarkActive = benchmark !== 'none' && nonEngland.length > 0;
  const reference = shownAreas[0] ? trendSeries(shownAreas[0].observations)[0] : undefined;
  const referenceSegment = reference ? segmentValuesKey(reference) : '';
  const seriesFor = (observations: IndicatorObservation[]) =>
    alignedTrendSeries(observations, reference);
  const englandSeries = england[0] ? seriesFor(england[0].observations) : [];
  const benchmarkFor = (areaCode: string): AreaBenchmark | undefined => {
    if (!benchmarkActive) return undefined;
    if (benchmark === 'england') {
      return {
        name: 'England',
        label: 'England',
        series: englandSeries,
        rangePeriods: ranges[geography.levelByCode[areaCode] ?? ''] ?? [],
      };
    }
    const region = geography.regionByCode[areaCode];
    if (!region) return undefined;
    const data = regionData.find(({ areaCode: code }) => code === region.code);
    return {
      name: `${region.name} (Statistical region)`,
      label: region.name,
      series: data ? seriesFor(data.observations) : [],
      rangePeriods: ranges['Statistical regions'] ?? [],
    };
  };
  const seriesByArea = shownAreas
    .map((data) => ({ data, series: seriesFor(data.observations) }))
    .filter(({ series }) => series.length > 0);
  const benchmarks = new Map(
    seriesByArea.map(({ data }) => [data.areaCode, benchmarkFor(data.areaCode)]),
  );
  const periods = [
    ...new Map(
      shownAreas
        .flatMap(({ observations }) => seriesFor(observations))
        .sort((a, b) => a.fromDate.localeCompare(b.fromDate) || a.toDate.localeCompare(b.toDate))
        .map((observation) => [
          `${observation.fromDate}|${observation.toDate}`,
          { fromDate: observation.fromDate, toDate: observation.toDate },
        ]),
    ).values(),
  ];
  const inPeriod =
    (period: (typeof periods)[number]) => (row: { fromDate: string; toDate: string }) =>
      row.fromDate === period.fromDate && row.toDate === period.toDate;
  const hasCounts = seriesByArea.some(({ series }) => series.some(({ count }) => count != null));
  const hasNumerators = seriesByArea.some(({ series }) =>
    series.some(({ numerator }) => numerator != null),
  );
  const lowerOf = (observation: IndicatorObservation) =>
    confidence === '99.8' ? observation.lowerCi998 : observation.lowerCi95;
  const upperOf = (observation: IndicatorObservation) =>
    confidence === '99.8' ? observation.upperCi998 : observation.upperCi95;

  return {
    benchmarks,
    firstObservation: seriesByArea[0]?.series[0],
    hasCounts,
    hasNumerators,
    inPeriod,
    lowerOf,
    periods,
    referenceSegment,
    seriesByArea,
    upperOf,
  };
}
