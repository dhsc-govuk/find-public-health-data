import { TableScrollRegion, TableSize } from '@fphd/ui';
import { expandedPeriodLabel } from '@fphd/utils/period-label';
import { Fragment, type ReactNode, useId } from 'react';
import { SpineChartKey } from '../charts/spine-chart.tsx';
import type { BenchmarkChoice } from '../comparison.ts';
import { type ConfidenceLevel, formatCalculatedValue, formatValue, segmentLabel } from '../data.ts';
import type {
  BenchmarkGeography,
  IndicatorAreaData,
  IndicatorDetail,
  IndicatorRangePeriod,
} from '../loader.ts';
import { type TrendColumns, trendTableModel } from '../trend.ts';
import {
  BenchmarkCells,
  BenchmarkChartCell,
  BenchmarkHeaderCells,
  benchmarkColumnCount,
} from './benchmark-cells.tsx';
import { NoteFootnotes, noteMarker } from './note-markers.tsx';

const HEADER = 'govuk-table__header';

/** The unit after a value column's heading, or nothing when the values have none. */
function UnitNote({ unit }: { unit: string | null }) {
  return unit === null ? null : (
    <>
      {' '}
      <span className="fphd-table-note">({unit})</span>
    </>
  );
}

export function TrendTable({
  areaData,
  benchmark = 'none',
  confidence,
  geography = { regionByCode: {}, levelByCode: {} },
  indicator,
  ranges = {},
  regionData = [],
  newestFirst = false,
  columns,
  visibleCaption = false,
}: {
  areaData: IndicatorAreaData[];
  benchmark?: BenchmarkChoice;
  confidence: ConfidenceLevel;
  geography?: BenchmarkGeography;
  indicator: IndicatorDetail;
  ranges?: Record<string, IndicatorRangePeriod[]>;
  regionData?: IndicatorAreaData[];
  newestFirst?: boolean;
  columns?: TrendColumns;
  visibleCaption?: boolean;
}) {
  const id = useId();
  const model = trendTableModel({
    areaData,
    benchmark,
    confidence,
    geography,
    ranges,
    regionData,
  });
  const {
    benchmarks,
    firstObservation,
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
  const spread = { minMax: columns?.minMax ?? false, percentiles: columns?.percentiles ?? false };
  const showChart = columns?.chart ?? false;
  if (!firstObservation) {
    return <p className="govuk-body">No data matches the selected options.</p>;
  }
  const benchmarkColumns = benchmarkColumnCount(spread);
  const cell = (areaSeries: (typeof seriesByArea)[number], period: (typeof periods)[number]) =>
    areaSeries.series.find(inPeriod(period));
  const columnsPerArea =
    Number(hasCounts) + Number(hasNumerators) + Number(showValues) + intervals.length * 2;
  const areaColumns = (areaCode: string) =>
    columnsPerArea + Number(showChart && benchmarks.get(areaCode) !== undefined);
  const columnCount =
    1 +
    seriesByArea.reduce(
      (total, { data }) =>
        total + areaColumns(data.areaCode) + (benchmarks.get(data.areaCode) ? benchmarkColumns : 0),
      0,
    );
  if (columnCount === 1) return <p className="govuk-body">Select at least one table column.</p>;
  const hasChartRange = [...benchmarks.values()].some((areaBenchmark) =>
    areaBenchmark?.rangePeriods.some(
      (range) =>
        range.segment === referenceSegment && periods.some((period) => inPeriod(period)(range)),
    ),
  );
  const valueSuffix = indicator.unit === '%' ? '%' : '';
  // Every distinct value note gets a sequential marker, explained under the table.
  const noteTexts = [
    ...new Set(
      seriesByArea
        .flatMap(({ series }) => series)
        .flatMap(({ notes }) => notes)
        .map(({ text }) => text),
    ),
  ];
  const areaPhrase =
    seriesByArea.length === 1
      ? seriesByArea[0]?.data.areaName
      : `${seriesByArea.length} chosen areas`;
  const rows = newestFirst ? periods.toReversed() : periods;
  // Each data cell names its row, its area or benchmark group and its own column heading,
  // so screen readers announce all three in the two-row header.
  const groupId = (index: number, group: 'area' | 'benchmark') => `${id}-${group}-${index}`;
  const headingId = (index: number, column: string) => `${id}-${index}-${column}`;
  const rowId = (index: number) => `${id}-row-${index}`;
  const headers = (row: number, area: number, group: 'area' | 'benchmark', column: string) =>
    `${rowId(row)} ${groupId(area, group)} ${headingId(area, column)}`;
  const heading = (area: number, column: string, label: ReactNode, className = HEADER) => (
    <th id={headingId(area, column)} scope="col" className={className}>
      {label}
    </th>
  );

  return (
    <>
      {showChart && hasChartRange ? <SpineChartKey /> : null}
      <TableScrollRegion label={`${indicator.name} trends over time`}>
        <table
          className="govuk-table fphd-trend-table"
          aria-label={
            visibleCaption
              ? undefined
              : `${indicator.name} trends over time, ${segmentLabel(firstObservation)}`
          }
        >
          <caption
            className={`govuk-table__caption ${visibleCaption ? 'govuk-table__caption--s' : 'govuk-visually-hidden'}`}
          >
            {visibleCaption ? (
              <>
                Table: {indicator.name}, {areaPhrase}
                <span className="govuk-visually-hidden">, {segmentLabel(firstObservation)}</span>
              </>
            ) : (
              <>
                {indicator.name} trends over time, {segmentLabel(firstObservation)}
              </>
            )}
            <TableSize rows={rows.length} columns={columnCount} />
          </caption>
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <td aria-hidden="true" className="govuk-table__header fphd-table__frozen" />
              {seriesByArea.map(({ data }, area) => (
                <Fragment key={data.areaCode}>
                  {areaColumns(data.areaCode) > 0 ? (
                    <th
                      id={groupId(area, 'area')}
                      scope="colgroup"
                      colSpan={areaColumns(data.areaCode)}
                      className={HEADER}
                    >
                      {data.areaName}
                    </th>
                  ) : null}
                  {benchmarks.get(data.areaCode) ? (
                    <th
                      id={groupId(area, 'benchmark')}
                      scope="colgroup"
                      colSpan={benchmarkColumns}
                      className={`${HEADER} fphd-trend-table__benchmark-group`}
                    >
                      {benchmarks.get(data.areaCode)?.name}
                    </th>
                  ) : null}
                </Fragment>
              ))}
            </tr>
            <tr className="govuk-table__row">
              <th id={`${id}-period`} scope="col" className={`${HEADER} fphd-table__frozen`}>
                Period
              </th>
              {seriesByArea.map(({ data }, area) => {
                const areaBenchmark = benchmarks.get(data.areaCode);
                return (
                  <Fragment key={data.areaCode}>
                    {showValues
                      ? heading(
                          area,
                          'value',
                          <>
                            Calculated value
                            <UnitNote unit={indicator.unit} />
                          </>,
                        )
                      : null}
                    {hasCounts
                      ? heading(
                          area,
                          'count',
                          <>
                            Count{' '}
                            {columns ? null : <span className="fphd-table-note">(Raw number)</span>}
                          </>,
                        )
                      : null}
                    {hasNumerators
                      ? heading(
                          area,
                          'numerator',
                          <>
                            Numerator{' '}
                            {columns ? null : <span className="fphd-table-note">(Raw number)</span>}
                          </>,
                        )
                      : null}
                    {showChart && areaBenchmark
                      ? heading(area, 'chart', `Compared with ${areaBenchmark.label}`)
                      : null}
                    {intervals.map((level) => (
                      <Fragment key={level}>
                        {heading(area, `lower-${level}`, `${level}% lower confidence interval`)}
                        {heading(area, `upper-${level}`, `${level}% upper confidence interval`)}
                      </Fragment>
                    ))}
                    {areaBenchmark ? (
                      <BenchmarkHeaderCells
                        columns={spread}
                        idFor={(column) => headingId(area, `benchmark-${column}`)}
                        unit={<UnitNote unit={indicator.unit} />}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {rows.map((period, row) => (
              <tr className="govuk-table__row" key={`${period.fromDate}-${period.toDate}`}>
                <th id={rowId(row)} scope="row" className="govuk-table__header fphd-table__frozen">
                  {expandedPeriodLabel(period, indicator.yearType)}
                </th>
                {seriesByArea.map((areaSeries, area) => {
                  const observation = cell(areaSeries, period);
                  const areaBenchmark = benchmarks.get(areaSeries.data.areaCode);
                  const benchmarkObservation = areaBenchmark?.series.find(inPeriod(period));
                  const rangePeriod = areaBenchmark?.rangePeriods.find(
                    (range) => inPeriod(period)(range) && range.segment === referenceSegment,
                  );
                  const at = (column: string) => headers(row, area, 'area', column);
                  return (
                    <Fragment key={areaSeries.data.areaCode}>
                      {showValues ? (
                        <td headers={at('value')} className="govuk-table__cell">
                          {observation ? (
                            <>
                              {formatCalculatedValue(observation.value)}
                              {/* The suffix belongs to a number, not to 'No data'. */}
                              {observation.value === null ? '' : valueSuffix}
                              {observation.notes
                                .map(({ text }) => noteMarker(noteTexts, text))
                                .join('')}
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                      ) : null}
                      {hasCounts ? (
                        <td headers={at('count')} className="govuk-table__cell">
                          {observation?.count == null ? '-' : formatValue(observation.count)}
                        </td>
                      ) : null}
                      {hasNumerators ? (
                        <td headers={at('numerator')} className="govuk-table__cell">
                          {observation?.numerator == null
                            ? '-'
                            : formatValue(observation.numerator)}
                        </td>
                      ) : null}
                      {showChart && areaBenchmark ? (
                        <BenchmarkChartCell
                          areaName={areaSeries.data.areaName}
                          areaObservation={observation}
                          benchmarkName={areaBenchmark.name}
                          benchmarkValue={benchmarkObservation?.value ?? null}
                          confidence={confidence === '99.8' ? '99.8' : '95'}
                          headers={at('chart')}
                          indicator={indicator}
                          rangePeriod={rangePeriod}
                          unit={indicator.unit}
                        />
                      ) : null}
                      {intervals.map((level) => {
                        const lower =
                          level === '95' ? observation?.lowerCi95 : observation?.lowerCi998;
                        const upper =
                          level === '95' ? observation?.upperCi95 : observation?.upperCi998;
                        return (
                          <Fragment key={level}>
                            <td headers={at(`lower-${level}`)} className="govuk-table__cell">
                              {lower != null
                                ? `${formatCalculatedValue(lower)}${valueSuffix}`
                                : '-'}
                            </td>
                            <td headers={at(`upper-${level}`)} className="govuk-table__cell">
                              {upper != null
                                ? `${formatCalculatedValue(upper)}${valueSuffix}`
                                : '-'}
                            </td>
                          </Fragment>
                        );
                      })}
                      {areaBenchmark ? (
                        <BenchmarkCells
                          benchmarkValue={benchmarkObservation?.value ?? null}
                          columns={spread}
                          format={(value) => (
                            <>
                              {formatCalculatedValue(value)}
                              {valueSuffix}
                            </>
                          )}
                          headersFor={(column) =>
                            headers(row, area, 'benchmark', `benchmark-${column}`)
                          }
                          rangePeriod={rangePeriod}
                        />
                      ) : null}
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScrollRegion>
      <NoteFootnotes noteTexts={noteTexts} />
    </>
  );
}
