import type { ReactNode } from 'react';
import { SpineChart } from '../charts/spine-chart.tsx';
import { benchmarkJudgement, formatCalculatedValue, withUnit } from '../data.ts';
import type { IndicatorDetail, IndicatorObservation, IndicatorRangePeriod } from '../loader.ts';

const BENCHMARK_HEADER = 'govuk-table__header fphd-trend-table__benchmark-cell';
const BENCHMARK_CELL = 'govuk-table__cell fphd-trend-table__benchmark-cell';

/** The benchmark group's sub-headers: its value, and the spread when the range is on. */
export function BenchmarkHeaderCells({
  showRange,
  unit,
}: {
  showRange: boolean;
  unit?: ReactNode;
}) {
  return (
    <>
      <th scope="col" className={BENCHMARK_HEADER}>
        Calculated value{unit}
      </th>
      {showRange ? (
        <>
          <th scope="col" className={BENCHMARK_HEADER}>
            Minimum
          </th>
          <th scope="col" className={BENCHMARK_HEADER}>
            Maximum
          </th>
          <th scope="col" className={BENCHMARK_HEADER}>
            Comparison
          </th>
        </>
      ) : null}
    </>
  );
}

type ComparableObservation = Pick<
  IndicatorObservation,
  'value' | 'lowerCi95' | 'upperCi95' | 'lowerCi998' | 'upperCi998'
>;

/** One row's benchmark cells: the value, and min/max/plot when the range is on. */
export function BenchmarkCells({
  areaName,
  areaObservation,
  benchmarkName,
  benchmarkValue,
  confidence = '95',
  format,
  indicator,
  rangePeriod,
  showRange,
  unit = null,
}: {
  areaName: string;
  unit?: string | null;
  areaObservation: ComparableObservation | undefined;
  benchmarkName: string;
  benchmarkValue: number | null;
  confidence?: '95' | '99.8';
  format: (value: number) => ReactNode;
  indicator: Pick<IndicatorDetail, 'polarity' | 'comparatorMethod'>;
  rangePeriod: IndicatorRangePeriod | undefined;
  showRange: boolean;
}) {
  const labelValue = (value: number) => withUnit(formatCalculatedValue(value), unit);
  const areaValue = areaObservation?.value ?? null;
  return (
    <>
      <td className={BENCHMARK_CELL}>{benchmarkValue == null ? '-' : format(benchmarkValue)}</td>
      {showRange ? (
        <>
          <td className={BENCHMARK_CELL}>{rangePeriod ? format(rangePeriod.min) : '-'}</td>
          <td className={BENCHMARK_CELL}>{rangePeriod ? format(rangePeriod.max) : '-'}</td>
          <td className={BENCHMARK_CELL}>
            {rangePeriod && areaValue != null && benchmarkValue != null ? (
              <SpineChart
                value={areaValue}
                benchmarkValue={benchmarkValue}
                min={rangePeriod.min}
                max={rangePeriod.max}
                p25={rangePeriod.p25}
                p75={rangePeriod.p75}
                unit={unit}
                judgement={benchmarkJudgement(
                  areaObservation,
                  benchmarkValue,
                  indicator,
                  confidence,
                )}
                valueLabel={`${areaName}: ${labelValue(areaValue)}`}
                benchmarkLabel={`${benchmarkName}: ${labelValue(benchmarkValue)}`}
                rangeLabel={`Range: ${labelValue(rangePeriod.min)} to ${labelValue(rangePeriod.max)}`}
              />
            ) : (
              '-'
            )}
          </td>
        </>
      ) : null}
    </>
  );
}
