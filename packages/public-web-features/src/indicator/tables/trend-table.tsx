import { TableScrollRegion } from '@fphd/ui';
import { periodLabel } from '@fphd/utils/period-label';
import { Fragment } from 'react';
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
import { BenchmarkCells, BenchmarkHeaderCells } from './benchmark-cells.tsx';
import { NoteFootnotes, noteMarker } from './note-markers.tsx';

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
  showRange = false,
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
  showRange?: boolean;
  newestFirst?: boolean;
  columns?: TrendColumns;
  visibleCaption?: boolean;
}) {
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
  if (!firstObservation) {
    return <p className="govuk-body">No data matches the selected options.</p>;
  }
  const benchmarkColumns = 1 + (showRange ? 3 : 0);
  const cell = (areaSeries: (typeof seriesByArea)[number], period: (typeof periods)[number]) =>
    areaSeries.series.find(inPeriod(period));
  const columnsPerArea =
    Number(hasCounts) + Number(hasNumerators) + Number(showValues) + intervals.length * 2;
  if (columnsPerArea === 0) return <p className="govuk-body">Select at least one table column.</p>;
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

  return (
    <>
      {showRange && benchmarks.size > 0 && [...benchmarks.values()].some(Boolean) ? (
        <SpineChartKey />
      ) : null}
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
                Table: {indicator.name}, {seriesByArea.map(({ data }) => data.areaName).join(', ')}
                <span className="govuk-visually-hidden">, {segmentLabel(firstObservation)}</span>
              </>
            ) : (
              <>
                {indicator.name} trends over time, {segmentLabel(firstObservation)}
              </>
            )}
          </caption>
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <td />
              {seriesByArea.map(({ data }) => (
                <Fragment key={data.areaCode}>
                  <th scope="colgroup" colSpan={columnsPerArea} className="govuk-table__header">
                    {data.areaName}
                  </th>
                  {benchmarks.get(data.areaCode) ? (
                    <th
                      scope="colgroup"
                      colSpan={benchmarkColumns}
                      className="govuk-table__header fphd-trend-table__benchmark-group"
                    >
                      {benchmarks.get(data.areaCode)?.name}
                    </th>
                  ) : null}
                </Fragment>
              ))}
            </tr>
            <tr className="govuk-table__row">
              <th scope="col" className="govuk-table__header">
                Period
              </th>
              {seriesByArea.map(({ data }) => (
                <Fragment key={data.areaCode}>
                  {hasCounts ? (
                    <th scope="col" className="govuk-table__header">
                      Count {columns ? null : <span className="fphd-table-note">(Raw number)</span>}
                    </th>
                  ) : null}
                  {hasNumerators ? (
                    <th scope="col" className="govuk-table__header">
                      Numerator{' '}
                      {columns ? null : <span className="fphd-table-note">(Raw number)</span>}
                    </th>
                  ) : null}
                  {showValues ? (
                    <th scope="col" className="govuk-table__header">
                      Calculated value
                      <UnitNote unit={indicator.unit} />
                    </th>
                  ) : null}
                  {intervals.map((level) => (
                    <Fragment key={level}>
                      <th scope="col" className="govuk-table__header">
                        {level}% lower confidence interval
                      </th>
                      <th scope="col" className="govuk-table__header">
                        {level}% upper confidence interval
                      </th>
                    </Fragment>
                  ))}
                  {benchmarks.get(data.areaCode) ? (
                    <BenchmarkHeaderCells
                      showRange={showRange}
                      unit={<UnitNote unit={indicator.unit} />}
                    />
                  ) : null}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {(newestFirst ? periods.toReversed() : periods).map((period) => (
              <tr className="govuk-table__row" key={`${period.fromDate}-${period.toDate}`}>
                <th scope="row" className="govuk-table__header">
                  {periodLabel(period, indicator.yearType)}
                </th>
                {seriesByArea.map((areaSeries) => {
                  const observation = cell(areaSeries, period);
                  const areaBenchmark = benchmarks.get(areaSeries.data.areaCode);
                  const benchmarkObservation = areaBenchmark?.series.find(inPeriod(period));
                  const rangePeriod = areaBenchmark?.rangePeriods.find(
                    (range) => inPeriod(period)(range) && range.segment === referenceSegment,
                  );
                  return (
                    <Fragment key={areaSeries.data.areaCode}>
                      {hasCounts ? (
                        <td className="govuk-table__cell">
                          {observation?.count == null ? '-' : formatValue(observation.count)}
                        </td>
                      ) : null}
                      {hasNumerators ? (
                        <td className="govuk-table__cell">
                          {observation?.numerator == null
                            ? '-'
                            : formatValue(observation.numerator)}
                        </td>
                      ) : null}
                      {showValues ? (
                        <td className="govuk-table__cell">
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
                      {intervals.map((level) => {
                        const lower =
                          level === '95' ? observation?.lowerCi95 : observation?.lowerCi998;
                        const upper =
                          level === '95' ? observation?.upperCi95 : observation?.upperCi998;
                        return (
                          <Fragment key={level}>
                            <td className="govuk-table__cell">
                              {lower != null
                                ? `${formatCalculatedValue(lower)}${valueSuffix}`
                                : '-'}
                            </td>
                            <td className="govuk-table__cell">
                              {upper != null
                                ? `${formatCalculatedValue(upper)}${valueSuffix}`
                                : '-'}
                            </td>
                          </Fragment>
                        );
                      })}
                      {areaBenchmark ? (
                        <BenchmarkCells
                          areaName={areaSeries.data.areaName}
                          areaObservation={observation}
                          benchmarkName={areaBenchmark.name}
                          benchmarkValue={benchmarkObservation?.value ?? null}
                          confidence={confidence === '99.8' ? '99.8' : '95'}
                          format={(value) => (
                            <>
                              {formatCalculatedValue(value)}
                              {valueSuffix}
                            </>
                          )}
                          indicator={indicator}
                          rangePeriod={rangePeriod}
                          unit={indicator.unit}
                          showRange={showRange}
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
