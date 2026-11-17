import { periodLabel } from '@fphd/utils/period-label';
import { stringify } from 'csv-stringify/sync';

import { type ConfidenceLevel, segmentLabel, unitNote } from './data.ts';
import type { IndicatorAreaData, IndicatorDetail } from './loader.ts';
import type { TrendColumns, trendTableModel } from './trend.ts';

export function tableCsv(
  rows: (string | number | null)[][],
  options: { excel?: boolean; formatNumber?: (value: number) => string } = {},
): string {
  return stringify(rows, {
    ...(options.excel ? { bom: true, record_delimiter: '\r\n' } : {}),
    escape_formulas: true,
    cast: {
      number: (value) => ({
        value: options.formatNumber ? options.formatNumber(value) : String(value),
        escape_formulas: false,
      }),
    },
  });
}

/** The trend table as displayed, including its selected intervals and benchmarks. */
export function trendCsv(
  indicator: IndicatorDetail,
  model: ReturnType<typeof trendTableModel>,
  confidence: ConfidenceLevel,
  columns?: TrendColumns,
): string {
  const {
    benchmarkGroups,
    hasCounts: availableCounts,
    hasNumerators: availableNumerators,
    inPeriod,
    periods,
    referenceSegment,
    seriesByArea,
  } = model;
  const hasCounts = columns ? columns.count : availableCounts;
  const hasNumerators = columns ? columns.numerator : availableNumerators;
  const showValues = columns?.value ?? true;
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
        ...(hasNumerators ? [`${data.areaName} numerator`] : []),
        ...intervals.flatMap((level) => [
          `${data.areaName} lower ${level}% CI`,
          `${data.areaName} upper ${level}% CI`,
        ]),
      ];
    }),
    ...benchmarkGroups.flatMap((benchmark) => [
      `${benchmark.name} calculated value${unitNote(indicator.unit)}`,
      ...(benchmark.rangePeriods
        ? spread.map((key) => `${benchmark.name} ${spreadLabels[key]}`)
        : []),
    ]),
  ];
  const rows = periods.map((period) => [
    periodLabel(period, indicator.yearType),
    ...seriesByArea.flatMap(({ series }) => {
      const observation = series.find(inPeriod(period));
      return [
        ...(showValues ? [observation?.value ?? null] : []),
        ...(hasCounts ? [observation?.count ?? null] : []),
        ...(hasNumerators ? [observation?.numerator ?? null] : []),
        ...intervals.flatMap((level) =>
          level === '95'
            ? [observation?.lowerCi95 ?? null, observation?.upperCi95 ?? null]
            : [observation?.lowerCi998 ?? null, observation?.upperCi998 ?? null],
        ),
      ];
    }),
    ...benchmarkGroups.flatMap((benchmark) => {
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
  indicator: IndicatorDetail,
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
      'Numerator',
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
        observation.numerator,
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
