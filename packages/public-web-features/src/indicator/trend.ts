import {
  benchmarkRange,
  canonicalBenchmarks,
  deprivationFor,
  deprivationType,
} from './benchmarks.ts';
import type { BenchmarkChoice } from './comparison.ts';
import {
  alignedTrendSeries,
  type ConfidenceLevel,
  sameSegment,
  segmentValuesKey,
  trendSeries,
} from './data.ts';
import type {
  BenchmarkGeography,
  IndicatorAreaData,
  IndicatorObservation,
  IndicatorRangePeriod,
} from './loader.ts';
import type { PolicyGoal } from './policy-goal.ts';

export interface AreaBenchmark {
  key: string;
  choice: BenchmarkChoice;
  areaCode: string;
  name: string;
  /** The benchmark as the comparison chart's heading names it: "Compared with <label>". */
  label: string;
  chartLabel: string;
  series: IndicatorObservation[];
  rangePeriods?: IndicatorRangePeriod[];
  goal?: PolicyGoal;
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
  goal?: boolean;
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
        'goal',
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
    goal: values.includes('goal'),
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
      columns.goal ? 'goal' : '',
    ]
      .filter(Boolean)
      .join(',') || 'none'
  );
}

export function trendTableModel({
  areaData,
  benchmarks = [],
  confidence,
  geography = { regionByCode: {}, levelByCode: {} },
  ranges = {},
  regionData = [],
  benchmarkData = [],
  goal,
}: {
  areaData: IndicatorAreaData[];
  benchmarks?: readonly BenchmarkChoice[];
  confidence: ConfidenceLevel;
  geography?: BenchmarkGeography;
  ranges?: Record<string, IndicatorRangePeriod[]>;
  regionData?: IndicatorAreaData[];
  benchmarkData?: IndicatorAreaData[];
  goal?: PolicyGoal | null;
}) {
  const nonEngland = areaData.filter(({ areaCode }) => areaCode !== 'E92000001');
  const england = areaData.filter(({ areaCode }) => areaCode === 'E92000001');
  const shownAreas = nonEngland.length === 0 ? areaData : nonEngland;
  const choices = nonEngland.length ? canonicalBenchmarks(benchmarks) : [];
  const reference = shownAreas[0] ? trendSeries(shownAreas[0].observations)[0] : undefined;
  const referenceSegment = reference ? segmentValuesKey(reference) : '';
  const seriesFor = (observations: IndicatorObservation[]) =>
    alignedTrendSeries(observations, reference);
  const englandSeries = england[0] ? seriesFor(england[0].observations) : [];
  const policyGoal = benchmarks.includes('goal') ? goal : undefined;
  const seriesByArea = shownAreas
    .map((data) => ({ data, series: seriesFor(data.observations) }))
    .filter(({ series }) => series.length > 0);
  const benchmarkFor = (choice: BenchmarkChoice, areaCode: string): AreaBenchmark | undefined => {
    if (choice === 'england') {
      return {
        key: 'england',
        choice,
        areaCode: 'E92000001',
        name: 'England',
        label: 'England',
        chartLabel: 'England',
        series: englandSeries,
        rangePeriods: ranges[benchmarkRange(geography, areaCode, 'england')?.key ?? ''] ?? [],
      };
    }
    if (choice === 'region') {
      const region = geography.regionByCode[areaCode];
      if (!region) return undefined;
      const data = regionData.find(({ areaCode: code }) => code === region.code);
      return {
        key: `region:${region.code}`,
        choice,
        areaCode: region.code,
        name: `${region.name} (Statistical region)`,
        label: region.name,
        chartLabel: region.name,
        series: data ? seriesFor(data.observations) : [],
        rangePeriods: ranges[benchmarkRange(geography, areaCode, 'region')?.key ?? ''] ?? [],
      };
    }
    const area = seriesByArea.find(({ data }) => data.areaCode === areaCode);
    if (!area) return undefined;
    if (choice === 'imd2019' || choice === 'imd2025') {
      const membership = deprivationFor(geography, areaCode, choice);
      if (!membership) return undefined;
      const type = deprivationType(membership);
      const deciles = (england[0]?.observations ?? []).filter(({ dimensions }) =>
        dimensions.some(
          (dimension) => dimension.type === type && dimension.sortOrder === membership.decile,
        ),
      );
      if (!deciles.length) return undefined;
      const name = `Decile ${membership.decile} (IMD ${choice.slice(3)})`;
      const key = `${choice}:${membership.dimensionValueId}:${area.series[0] ? segmentValuesKey(area.series[0]) : ''}`;
      return {
        key,
        choice,
        areaCode: key,
        name,
        label: `similarly deprived areas (IMD ${choice.slice(3)})`,
        chartLabel: name,
        series: area.series.flatMap((observation) => {
          const match = deciles.find(
            (candidate) =>
              candidate.fromDate === observation.fromDate &&
              candidate.toDate === observation.toDate &&
              sameSegment(observation, {
                ...candidate,
                dimensions: candidate.dimensions.filter((dimension) => dimension.type !== type),
              }),
          );
          return match ? [{ ...match, dimensions: observation.dimensions }] : [];
        }),
        rangePeriods: ranges[membership.dimensionValueId] ?? [],
      };
    }
    if (choice === `neighbours:${areaCode}`) {
      const neighbours = geography.neighboursByCode?.[areaCode];
      if (!neighbours?.length) return undefined;
      const name = `Statistical neighbours (${area.data.areaName})`;
      return {
        key: choice,
        choice,
        areaCode: choice,
        name,
        label: name,
        chartLabel: name,
        series: area.series.map((observation) => {
          const values = neighbours.flatMap((code) => {
            const match = benchmarkData
              .find((data) => data.areaCode === code)
              ?.observations.find(
                (candidate) =>
                  candidate.fromDate === observation.fromDate &&
                  candidate.toDate === observation.toDate &&
                  sameSegment(candidate, observation),
              );
            return match?.value == null ? [] : [match.value];
          });
          return {
            ...observation,
            value: values.length
              ? values.reduce((sum, value) => sum + value, 0) / values.length
              : null,
            count: null,
            numerator: null,
            denominator: null,
            lowerCi95: null,
            upperCi95: null,
            lowerCi998: null,
            upperCi998: null,
            notes: [],
          };
        }),
      };
    }
    if (choice === `ca:${areaCode}`) {
      const ca = geography.caByCode?.[areaCode];
      if (!ca) return undefined;
      const name = `Combined authority (${area.data.areaName})`;
      const observations =
        benchmarkData.find((data) => data.areaCode === ca.code)?.observations ?? [];
      return {
        key: choice,
        choice,
        areaCode: choice,
        name,
        label: name,
        chartLabel: name,
        series: area.series.flatMap((observation) => {
          const match = observations.find(
            (candidate) =>
              candidate.fromDate === observation.fromDate &&
              candidate.toDate === observation.toDate &&
              sameSegment(candidate, observation),
          );
          return match ? [match] : [];
        }),
      };
    }
    return undefined;
  };
  const benchmarksByArea = new Map(
    seriesByArea.map(({ data }) => [
      data.areaCode,
      choices.flatMap((choice) => benchmarkFor(choice, data.areaCode) ?? []),
    ]),
  );
  const groups = new Map<string, AreaBenchmark>();
  for (const choice of choices) {
    for (const { data } of seriesByArea) {
      const benchmark = benchmarksByArea
        .get(data.areaCode)
        ?.find((entry) => entry.choice === choice);
      if (benchmark) {
        const existing = groups.get(benchmark.key);
        groups.set(
          benchmark.key,
          existing
            ? {
                ...existing,
                // Areas of different tiers share this group but not a spread. Showing the first
                // area's spread for both would be wrong, so the group shows none; each area's own
                // comparison chart still uses its tier's spread.
                ...(existing.rangePeriods === benchmark.rangePeriods ? {} : { rangePeriods: [] }),
                series: [
                  ...new Map(
                    [...existing.series, ...benchmark.series].map((observation) => [
                      `${observation.fromDate}/${observation.toDate}`,
                      observation,
                    ]),
                  ).values(),
                ],
              }
            : benchmark,
        );
      }
    }
  }
  if (policyGoal) {
    for (const { data, series } of seriesByArea) {
      const key = `goal:${data.areaCode}`;
      groups.set(key, {
        key,
        choice: 'goal',
        areaCode: key,
        name: 'Policy goal',
        label: data.areaName,
        chartLabel: 'Policy goal',
        series,
        goal: policyGoal,
      });
    }
  }
  const benchmarkGroups = [...groups.values()].sort((a, b) => {
    const family = a.choice.split(':')[0];
    if (family !== b.choice.split(':')[0])
      return canonicalBenchmarks([a.choice, b.choice])[0] === a.choice ? -1 : 1;
    if (!['neighbours', 'ca'].includes(family ?? '')) return 0;
    return (
      shownAreas.findIndex(({ areaCode }) => areaCode === a.choice.split(':')[1]) -
      shownAreas.findIndex(({ areaCode }) => areaCode === b.choice.split(':')[1])
    );
  });
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
    benchmarkGroups,
    benchmarksByArea,
    firstObservation: seriesByArea[0]?.series[0],
    hasCounts,
    hasNumerators,
    inPeriod,
    lowerOf,
    periods,
    policyGoal,
    referenceSegment,
    seriesByArea,
    upperOf,
  };
}

export function trendChartAreas(model: ReturnType<typeof trendTableModel>): IndicatorAreaData[] {
  return [
    ...model.seriesByArea.map(({ data, series }) => ({ ...data, observations: series })),
    ...model.benchmarkGroups
      .filter(
        (benchmark) =>
          !benchmark.goal &&
          !model.seriesByArea.some(({ data }) => data.areaCode === benchmark.areaCode),
      )
      .map((benchmark) => ({
        areaCode: benchmark.areaCode,
        areaName: benchmark.chartLabel,
        observations: benchmark.series,
      })),
  ];
}
