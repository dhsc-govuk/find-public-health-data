import type { ReactNode } from 'react';
import { SpineChart } from '../charts/spine-chart.tsx';
import { benchmarkJudgement, formatCalculatedValue, withUnit } from '../data.ts';
import type { IndicatorObservation, IndicatorPageDetail, IndicatorRangePeriod } from '../loader.ts';

const BENCHMARK_HEADER = 'govuk-table__header fphd-trend-table__benchmark-cell';
const BENCHMARK_CELL = 'govuk-table__cell fphd-trend-table__benchmark-cell';

/** Which parts of the benchmark's spread across its areas the table shows. */
export interface BenchmarkSpreadColumns {
  minMax: boolean;
  percentiles: boolean;
}

/** The number of columns the benchmark group spans: its value and the chosen spread. */
export function benchmarkColumnCount({ minMax, percentiles }: BenchmarkSpreadColumns): number {
  return 1 + (minMax ? 2 : 0) + (percentiles ? 2 : 0);
}

/** The spread's columns from lowest to highest, as the headers and cells both order them. */
function spreadColumns({ minMax, percentiles }: BenchmarkSpreadColumns) {
  return [
    ...(minMax ? [{ key: 'min', label: 'Lowest' } as const] : []),
    ...(percentiles
      ? [
          { key: 'p25', label: '25th percentile' } as const,
          { key: 'p75', label: '75th percentile' } as const,
        ]
      : []),
    ...(minMax ? [{ key: 'max', label: 'Highest' } as const] : []),
  ];
}

/** The benchmark group's sub-headers: its value, then the chosen parts of its spread. */
export function BenchmarkHeaderCells({
  columns,
  idFor,
  unit,
}: {
  columns: BenchmarkSpreadColumns;
  /** Each heading's id, for the cells that name it in their `headers`. */
  idFor?: (column: string) => string;
  unit?: ReactNode;
}) {
  return (
    <>
      <th id={idFor?.('value')} scope="col" className={BENCHMARK_HEADER}>
        Calculated value{unit}
      </th>
      {spreadColumns(columns).map(({ key, label }) => (
        <th id={idFor?.(key)} key={key} scope="col" className={BENCHMARK_HEADER}>
          {label}
        </th>
      ))}
    </>
  );
}

/** One row's benchmark cells: the benchmark's value, then the chosen parts of its spread. */
export function BenchmarkCells({
  benchmarkValue,
  columns,
  format,
  headersFor,
  rangePeriod,
}: {
  benchmarkValue: number | null;
  columns: BenchmarkSpreadColumns;
  format: (value: number) => ReactNode;
  /** The ids of the headings that name each cell. */
  headersFor?: (column: string) => string;
  rangePeriod: IndicatorRangePeriod | undefined;
}) {
  return (
    <>
      <td headers={headersFor?.('value')} className={BENCHMARK_CELL}>
        {benchmarkValue == null ? '-' : format(benchmarkValue)}
      </td>
      {spreadColumns(columns).map(({ key }) => {
        const value = rangePeriod?.[key];
        return (
          <td headers={headersFor?.(key)} key={key} className={BENCHMARK_CELL}>
            {value == null ? '-' : format(value)}
          </td>
        );
      })}
    </>
  );
}

type ComparableObservation = Pick<
  IndicatorObservation,
  'value' | 'lowerCi95' | 'upperCi95' | 'lowerCi998' | 'upperCi998'
>;

/** The cell charting an area's value against its benchmark and the spread across areas. */
export function BenchmarkChartCell({
  areaName,
  areaObservation,
  benchmarkName,
  benchmarkValue,
  confidence = '95',
  headers,
  indicator,
  rangePeriod,
  unit = null,
}: {
  areaName: string;
  headers?: string;
  unit?: string | null;
  areaObservation: ComparableObservation | undefined;
  benchmarkName: string;
  benchmarkValue: number | null;
  confidence?: '95' | '99.8';
  indicator: Pick<IndicatorPageDetail, 'polarity' | 'comparatorMethod'>;
  rangePeriod: IndicatorRangePeriod | undefined;
}) {
  const labelValue = (value: number) => withUnit(formatCalculatedValue(value), unit);
  const areaValue = areaObservation?.value ?? null;
  return (
    <td headers={headers} className="govuk-table__cell fphd-table__chart-cell">
      {rangePeriod && areaValue != null && benchmarkValue != null ? (
        <SpineChart
          value={areaValue}
          benchmarkValue={benchmarkValue}
          min={rangePeriod.min}
          max={rangePeriod.max}
          p25={rangePeriod.p25}
          p75={rangePeriod.p75}
          unit={unit}
          judgement={benchmarkJudgement(areaObservation, benchmarkValue, indicator, confidence)}
          valueLabel={`${areaName}: ${labelValue(areaValue)}`}
          benchmarkLabel={`${benchmarkName}: ${labelValue(benchmarkValue)}`}
          rangeLabel={`Range: ${labelValue(rangePeriod.min)} to ${labelValue(rangePeriod.max)}`}
        />
      ) : (
        '-'
      )}
    </td>
  );
}
