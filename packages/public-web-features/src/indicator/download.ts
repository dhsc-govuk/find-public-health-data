import { periodLabel } from '@fphd/utils/period-label';
import { stringify } from 'csv-stringify/sync';

import { type ConfidenceLevel, segmentLabel, unitNote } from './data.ts';
import type { IndicatorAreaData, IndicatorPageDetail } from './loader.ts';
import { goalVerdict } from './policy-goal.ts';
import type { TrendColumns, trendTableModel } from './trend.ts';

export function tableCsv(
  rows: (string | number | null)[][],
  options: {
    excel?: boolean;
    formatNumber?: (value: number, column: number | string | undefined) => string;
  } = {},
): string {
  return stringify(rows, {
    ...(options.excel ? { bom: true, record_delimiter: '\r\n' } : {}),
    escape_formulas: true,
    cast: {
      number: (value, context) => ({
        value: options.formatNumber ? options.formatNumber(value, context.column) : String(value),
        escape_formulas: false,
      }),
    },
  });
}

/** The trend table as displayed, including its selected intervals and benchmarks. */
export function trendCsv(
  indicator: IndicatorPageDetail,
  model: ReturnType<typeof trendTableModel>,
  confidence: ConfidenceLevel,
  columns?: TrendColumns,
): string {
  const {
    hasCounts: availableCounts,
    inPeriod,
    periods,
    referenceSegment,
    seriesByArea,
    policyGoal,
  } = model;
  const hasCounts = columns ? columns.count : availableCounts;
  const showValues = columns?.value ?? true;
  const showGoal = !!policyGoal && (columns?.goal ?? true);
  const benchmarkGroups = model.benchmarkGroups.filter((benchmark) => !benchmark.goal || showGoal);
  const intervals = columns?.confidence ?? (confidence === 'none' ? [] : [confidence]);
  const spread = [
    ...(columns?.minMax ? (['min'] as const) : []),
    ...(columns?.percentiles ? (['p25', 'p75'] as const) : []),
    ...(columns?.minMax ? (['max'] as const) : []),
  ];
  const spreadLabels = {
    min: 'lowest',
    p25: '25th percentile',
    p75: '75th percentile',
    max: 'highest',
  };
  const headers = [
    'Period',
    ...seriesByArea.flatMap(({ data }) => {
      return [
        ...(showValues ? [`${data.areaName} calculated value${unitNote(indicator.unit)}`] : []),
        ...(hasCounts ? [`${data.areaName} count`] : []),
        ...intervals.flatMap((level) => [
          `${data.areaName} lower ${level}% CI`,
          `${data.areaName} upper ${level}% CI`,
        ]),
      ];
    }),
    ...benchmarkGroups.flatMap((benchmark) =>
      benchmark.goal
        ? [`${benchmark.label} compared with policy goal`]
        : [
            `${benchmark.name} calculated value${unitNote(indicator.unit)}`,
            ...(benchmark.rangePeriods
              ? spread.map((key) => `${benchmark.name} ${spreadLabels[key]}`)
              : []),
          ],
    ),
  ];
  const rows = periods.map((period) => [
    periodLabel(period, indicator.yearType),
    ...seriesByArea.flatMap(({ series }) => {
      const observation = series.find(inPeriod(period));
      return [
        ...(showValues ? [observation?.value ?? null] : []),
        ...(hasCounts ? [observation?.count ?? null] : []),
        ...intervals.flatMap((level) =>
          level === '95'
            ? [observation?.lowerCi95 ?? null, observation?.upperCi95 ?? null]
            : [observation?.lowerCi998 ?? null, observation?.upperCi998 ?? null],
        ),
      ];
    }),
    ...benchmarkGroups.flatMap<string | number | null>((benchmark) => {
      if (benchmark.goal)
        return [goalVerdict(benchmark.series.find(inPeriod(period))?.value, benchmark.goal)];
      const range = benchmark.rangePeriods?.find(
        (candidate) => inPeriod(period)(candidate) && candidate.segment === referenceSegment,
      );
      return [
        benchmark.series.find(inPeriod(period))?.value ?? null,
        ...(benchmark.rangePeriods ? spread.map((key) => range?.[key] ?? null) : []),
      ];
    }),
  ]);
  return tableCsv([headers, ...rows]);
}

/** Every observation for the selected areas, segments and notes included. */
export function allDataCsv(
  indicator: IndicatorPageDetail,
  areaData: IndicatorAreaData[],
  areaType: (areaCode: string) => string | null,
  includeHeader = true,
): string {
  const rows: (string | number | null)[][] = [
    [
      'Indicator',
      'Area',
      'Area type',
      'Period',
      'Segment',
      'Count',
      'Denominator',
      `Calculated value${unitNote(indicator.unit)}`,
      'Lower 95% CI',
      'Upper 95% CI',
      'Lower 99.8% CI',
      'Upper 99.8% CI',
      'Value notes',
    ],
  ];
  for (const data of areaData) {
    for (const observation of data.observations) {
      rows.push([
        indicator.name,
        data.areaName,
        areaType(data.areaCode),
        periodLabel(observation, indicator.yearType),
        segmentLabel(observation),
        observation.count,
        observation.denominator,
        observation.value,
        observation.lowerCi95,
        observation.upperCi95,
        observation.lowerCi998,
        observation.upperCi998,
        observation.notes.map(({ text }) => text).join('; ') || null,
      ]);
    }
  }
  return tableCsv(includeHeader ? rows : rows.slice(1));
}
