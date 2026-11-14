import { INDICATOR_SORTS, type IndicatorSort } from '@fphd/utils/indicator-sort';
import { ENGLAND_AREA_CODE } from '@fphd/utils/observation-series';
import { periodLabel } from '@fphd/utils/period-label';
import {
  type BenchmarkJudgement,
  benchmarkJudgement,
  type ComparisonRow,
  comparisonRows,
  filterObservations,
  formatCalculatedValue,
  sameSegment,
  trendSeries,
  withUnit,
} from '../indicator/data.ts';
import type { SelectedIndicator } from '../indicator/loader.ts';

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

export const AREA_SUMMARY_SORTS = [
  { value: 'subtopic-asc', label: SORT_LABELS['subtopic-asc'] },
  { value: 'subtopic-desc', label: SORT_LABELS['subtopic-desc'] },
  { value: 'name-asc', label: SORT_LABELS['name-asc'] },
  { value: 'name-desc', label: SORT_LABELS['name-desc'] },
  { value: 'recently-updated', label: 'Recently updated' },
] as const;

export function topicAreaRowSort(params: URLSearchParams) {
  const sort = params.get('areaRowSort') ?? params.get('sort');
  return AREA_SUMMARY_SORTS.find(({ value }) => value === sort)?.value ?? 'subtopic-asc';
}

export const DEFAULT_TOPIC_AREA_GROUP = 'Statistical regions';

export const TOPIC_AREA_GROUPS = [
  'Integrated care boards',
  'Local authorities',
  'NHS regions',
  DEFAULT_TOPIC_AREA_GROUP,
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

export function topicEnglandMeasures(columns: TopicColumn[], compared: boolean) {
  return compared
    ? (['count', 'numerator', 'value'] as const).filter(
        (measure) => measure === 'value' || columns.includes(measure),
      )
    : [];
}

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
): SelectedIndicator[] {
  return selected.map((entry) => {
    const rows = comparisonRows([entry]);
    const keep = new Set<SelectedIndicator['areaData'][number]['observations'][number]>();
    for (const row of rows) {
      const england = entry.areaData.find(({ areaCode }) => areaCode === ENGLAND_AREA_CODE);
      const benchmarkSeries = trendSeries(filterObservations(england?.observations ?? [], row));
      for (const point of trendPoints
        ? benchmarkSeries.filter(({ value }) => value !== null).slice(-trendPoints)
        : [])
        keep.add(point);
      const benchmarkLatest = benchmarkSeries.at(-1);
      if (benchmarkLatest) keep.add(benchmarkLatest);
      for (const cell of row.cells) {
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

// The prototype gives no verdict wherever Fingertips gives none or the indicator has no polarity.
export function comparisonSummary(
  judgement: BenchmarkJudgement | null | undefined,
  benchmark?: { value: number; period: string },
  unit?: string | null,
): string {
  if (judgement == null) return JUDGEMENT_LABELS.none;
  const summary =
    judgement === 'better' || judgement === 'similar' || judgement === 'worse'
      ? JUDGEMENT_LABELS[judgement]
      : 'Neither better nor worse';
  return benchmark
    ? `${summary} (England: ${withUnit(formatCalculatedValue(benchmark.value), unit ?? null)}, ${benchmark.period})`
    : summary;
}

export function topicJudgement(...args: Parameters<typeof benchmarkJudgement>): BenchmarkJudgement {
  return args[2].polarity === 'no-polarity' ? 'none' : benchmarkJudgement(...args);
}
