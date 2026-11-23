import { isOneOf } from '@fphd/utils/is-one-of';
import {
  alignedTrendSeries,
  availableConfidenceLevels,
  type BenchmarkJudgement,
  benchmarkJudgement,
  type ConfidenceLevel,
  inequalityBreakdown,
  inequalityCategories,
  inequalityPeriods,
  sameSegment,
} from './data.ts';
import type { IndicatorObservation, SelectedIndicator } from './loader.ts';

export type InequalityRow = IndicatorObservation & { comparison: BenchmarkJudgement };

export function inequalityTableModel(indicator: SelectedIndicator, params: URLSearchParams) {
  const { areaData, detail } = indicator;
  const id = detail.shortId;
  const published = areaData.filter(
    ({ observations }) => inequalityCategories(observations).length > 0,
  );
  // England is left out when the indicator has no England value.
  const areas = published.length
    ? published
    : areaData.filter(
        ({ areaCode, observations }) => areaCode !== 'E92000001' || observations.length > 0,
      );
  const area =
    areas.find(({ areaCode }) => areaCode === params.get(`ig-${id}`)) ??
    areas.find(({ areaCode }) => areaCode === 'E92000001') ??
    areas[0];
  const observations = area?.observations ?? [];
  const categories = inequalityCategories(observations);
  const requestedCategory = params.get(`ic-${id}`) ?? '';
  const category = categories.includes(requestedCategory)
    ? requestedCategory
    : (categories[0] ?? '');
  const periods = inequalityPeriods(observations, category, detail.yearType);
  const requestedPeriod = params.get(`ip-${id}`) ?? '';
  const period = periods.some(({ value }) => value === requestedPeriod)
    ? requestedPeriod
    : (periods.at(-1)?.value ?? '');
  const rows = inequalityBreakdown(observations, category, period);
  const confidenceLevels = availableConfidenceLevels(rows);
  const requestedConfidence = params.get(`ci-${id}`);
  const confidence: ConfidenceLevel = isOneOf(confidenceLevels, requestedConfidence)
    ? requestedConfidence
    : 'none';
  const comparisonConfidence: ConfidenceLevel = params.has(`ci-${id}`)
    ? confidence
    : confidenceLevels.includes('99.8')
      ? '99.8'
      : confidenceLevels.includes('95')
        ? '95'
        : 'none';
  const first = rows[0];
  const reference = first
    ? {
        ...first,
        dimensions: first.dimensions.filter(
          ({ dimensionClass }) => dimensionClass !== 'inequality',
        ),
      }
    : undefined;
  const england = areaData.find(({ areaCode }) => areaCode === 'E92000001')?.observations ?? [];
  const benchmark = reference
    ? alignedTrendSeries(england, reference).find(
        (row) =>
          sameSegment(row, reference) &&
          row.fromDate === reference.fromDate &&
          row.toDate === reference.toDate,
      )
    : undefined;
  return {
    areas,
    area,
    categories,
    category,
    periods,
    period,
    rows: rows.map(
      (row): InequalityRow => ({
        ...row,
        comparison: benchmarkJudgement(
          row,
          benchmark?.value ?? null,
          detail,
          comparisonConfidence === '99.8' ? '99.8' : '95',
        ),
      }),
    ),
    confidenceLevels,
    confidence,
    comparisonConfidence,
    benchmark,
  };
}
