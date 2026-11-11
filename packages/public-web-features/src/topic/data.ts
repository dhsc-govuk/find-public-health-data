import { INDICATOR_SORTS, type IndicatorSort } from '@fphd/utils/indicator-sort';
import { ENGLAND_AREA_CODE } from '@fphd/utils/observation-series';
import { periodLabel } from '@fphd/utils/period-label';
import {
  availablePeriodTypes,
  type BenchmarkJudgement,
  benchmarkJudgement,
  type ComparisonRow,
  comparisonRows,
  filterObservations,
  sameSegment,
  trendSeries,
} from '../indicator/data.ts';
import type { IndicatorObservation, SelectedIndicator } from '../indicator/loader.ts';

const SORT_LABELS: Record<IndicatorSort, string> = {
  'subtopic-asc': 'Subtopic (A to Z)',
  'subtopic-desc': 'Subtopic (Z to A)',
  'name-asc': 'Indicator name (A to Z)',
  'name-desc': 'Indicator name (Z to A)',
  'period-desc': 'Most recent data first',
  'trend-desc': 'Trend: increasing first',
  'trend-asc': 'Trend: decreasing first',
  'trend-better': 'Trend: getting better first',
  'trend-worse': 'Trend: getting worse first',
};
export const TOPIC_SORTS = INDICATOR_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }));

export const TOPIC_AREA_GROUPS = [
  'Integrated care boards',
  'Local authorities',
  'NHS regions',
  'Statistical regions',
];

export const TOPIC_COLUMNS = [
  { value: 'period', label: 'Most recent period' },
  { value: 'updated', label: 'Last updated' },
  { value: 'trend', label: 'Trend (last 5 periods)' },
  { value: 'count', label: 'Count' },
  { value: 'numerator', label: 'Numerator' },
  { value: 'value', label: 'Calculated value' },
] as const;
export type TopicColumn = (typeof TOPIC_COLUMNS)[number]['value'];
export function topicColumns(params: URLSearchParams): TopicColumn[] {
  const selected = params.has('columns-topic')
    ? params.getAll('columns-topic').flatMap((value) => value.split(','))
    : ['period', 'updated', 'trend', 'value'];
  return TOPIC_COLUMNS.map(({ value }) => value).filter((value) => selected.includes(value));
}

export function topicSubtopics(entry: SelectedIndicator, topicSlug: string): string[] {
  return (
    entry.detail.topics
      .find(({ slug }) => slug === topicSlug)
      ?.subtopics?.map(({ title }) => title) ?? []
  );
}

export function englandObservation(
  entry: SelectedIndicator,
  row: Pick<ComparisonRow, 'sex' | 'periodType' | 'series'>,
) {
  const england = entry.areaData.find(({ areaCode }) => areaCode === ENGLAND_AREA_CODE);
  const period = row.series.at(-1);
  const series = trendSeries(
    filterObservations(england?.observations ?? [], row).filter(
      (observation) => !period || sameSegment(observation, period),
    ),
  );
  return period
    ? series.find(
        ({ fromDate, toDate }) => fromDate === period.fromDate && toDate === period.toDate,
      )
    : series.at(-1);
}

export function observationPeriod(
  entry: SelectedIndicator,
  observation: Parameters<typeof periodLabel>[0] | undefined,
) {
  return observation ? periodLabel(observation, entry.detail.yearType) : 'No data';
}

/** Keep the displayed series and their same-period benchmarks out of the full observation history. */
export function topicTableSelection(
  selected: SelectedIndicator[],
  trendPoints = 5,
  sparklinePeriods = 0,
): SelectedIndicator[] {
  return selected.map((entry) => {
    const rows = comparisonRows([entry]);
    const keep = new Set<SelectedIndicator['areaData'][number]['observations'][number]>();
    const keepSparkline = (series: IndicatorObservation[]) => {
      if (!sparklinePeriods) return;
      const periodType = availablePeriodTypes(series).length > 1 ? '3-year' : 'all';
      for (const point of filterObservations(series, { periodType }).slice(-sparklinePeriods))
        keep.add(point);
    };
    for (const row of rows) {
      const england = entry.areaData.find(({ areaCode }) => areaCode === ENGLAND_AREA_CODE);
      const benchmarkSeries = trendSeries(filterObservations(england?.observations ?? [], row));
      keepSparkline(benchmarkSeries);
      for (const point of trendPoints
        ? benchmarkSeries.filter(({ value }) => value !== null).slice(-trendPoints)
        : [])
        keep.add(point);
      const benchmarkLatest = benchmarkSeries.at(-1);
      if (benchmarkLatest) keep.add(benchmarkLatest);
      for (const cell of row.cells) {
        keepSparkline(cell.series);
        for (const point of trendPoints
          ? cell.series.filter(({ value }) => value !== null).slice(-trendPoints)
          : [])
          keep.add(point);
        const latest = cell.series.at(-1);
        if (latest) keep.add(latest);
        const england = englandObservation(entry, { ...row, series: cell.series });
        if (england) keep.add(england);
      }
    }
    return {
      ...entry,
      areaData: entry.areaData.map((area) => ({
        ...area,
        observations: area.observations.filter((point) => keep.has(point)),
      })),
    };
  });
}

export const JUDGEMENT_LABELS: Record<BenchmarkJudgement, string> = {
  better: 'Better than England',
  similar: 'Similar to England',
  worse: 'Worse than England',
  lower: 'Lower than England',
  higher: 'Higher than England',
  none: 'No comparison available',
};

export function topicJudgement(...args: Parameters<typeof benchmarkJudgement>): BenchmarkJudgement {
  return args[2].polarity === 'no-polarity' ? 'none' : benchmarkJudgement(...args);
}
