import { periodLabel } from '@fphd/utils/period-label';
import { stringify } from 'csv-stringify/sync';

import { type ConfidenceLevel, segmentLabel, unitNote } from './data.ts';
import type { IndicatorAreaData, IndicatorDetail } from './loader.ts';
import type { TrendColumns, trendTableModel } from './trend.ts';

export function tableCsv(rows: (string | number | null)[][]): string {
  return stringify(rows, {
    escape_formulas: true,
    cast: { number: (value) => ({ value: String(value), escape_formulas: false }) },
  });
}

/** The trend table as displayed, including its selected intervals and benchmarks. */
export function trendCsv(
  indicator: IndicatorDetail,
  model: ReturnType<typeof trendTableModel>,
  confidence: ConfidenceLevel,
  showRange: boolean,
  columns?: TrendColumns,
): string {
  const {
    benchmarks,
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
  const headers = [
    'Period',
    ...seriesByArea.flatMap(({ data }) => {
      const benchmark = benchmarks.get(data.areaCode);
      return [
        ...(hasCounts ? [`${data.areaName} count`] : []),
        ...(hasNumerators ? [`${data.areaName} numerator`] : []),
        ...(showValues ? [`${data.areaName} calculated value${unitNote(indicator.unit)}`] : []),
        ...intervals.flatMap((level) => [
          `${data.areaName} lower ${level}% CI`,
          `${data.areaName} upper ${level}% CI`,
        ]),
        ...(benchmark
          ? [
              `${data.areaName} ${benchmark.name} calculated value${unitNote(indicator.unit)}`,
              ...(showRange
                ? [
                    `${data.areaName} ${benchmark.name} minimum`,
                    `${data.areaName} ${benchmark.name} maximum`,
                  ]
                : []),
            ]
          : []),
      ];
    }),
  ];
  const rows = periods.map((period) => [
    periodLabel(period, indicator.yearType),
    ...seriesByArea.flatMap(({ data, series }) => {
      const observation = series.find(inPeriod(period));
      const benchmark = benchmarks.get(data.areaCode);
      const benchmarkObservation = benchmark?.series.find(inPeriod(period));
      const range = benchmark?.rangePeriods.find(
        (candidate) => inPeriod(period)(candidate) && candidate.segment === referenceSegment,
      );
      return [
        ...(hasCounts ? [observation?.count ?? null] : []),
        ...(hasNumerators ? [observation?.numerator ?? null] : []),
        ...(showValues ? [observation?.value ?? null] : []),
        ...intervals.flatMap((level) =>
          level === '95'
            ? [observation?.lowerCi95 ?? null, observation?.upperCi95 ?? null]
            : [observation?.lowerCi998 ?? null, observation?.upperCi998 ?? null],
        ),
        ...(benchmark
          ? [
              benchmarkObservation?.value ?? null,
              ...(showRange ? [range?.min ?? null, range?.max ?? null] : []),
            ]
          : []),
      ];
    }),
  ]);
  return tableCsv([headers, ...rows]);
}

/** Every observation for the selected areas, segments and notes included. */
export function allDataCsv(
  indicator: IndicatorDetail,
  areaData: IndicatorAreaData[],
  includeHeader = true,
): string {
  const rows: (string | number | null)[][] = [
    [
      'Indicator',
      'Area',
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
