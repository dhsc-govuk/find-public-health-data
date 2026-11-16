import { TableScrollRegion } from '@fphd/ui';
import { indicatorPath } from '@fphd/utils/indicator-path';
import { Fragment } from 'react';
import { Link } from 'react-router';
import { SpineChartKey } from '../charts/spine-chart.tsx';
import { type BenchmarkChoice, comparisonTable } from '../comparison.ts';
import { formatCalculatedValue, formatValue, withUnit } from '../data.ts';
import type { BenchmarkGeography, SelectedIndicator } from '../loader.ts';
import { TrendTag } from '../trend-tag.tsx';
import { BenchmarkCells, BenchmarkHeaderCells } from './benchmark-cells.tsx';
import { NoteFootnotes, noteMarker } from './note-markers.tsx';

export function ComparisonTable({
  selected,
  geography = { regionByCode: {}, levelByCode: {} },
  benchmark = 'none',
  showRange = false,
  indicatorLinks = false,
  label = 'Compare selected indicators',
  indicatorAnnotations = {},
}: {
  selected: SelectedIndicator[];
  geography?: BenchmarkGeography;
  benchmark?: BenchmarkChoice;
  showRange?: boolean;
  indicatorLinks?: boolean;
  label?: string;
  indicatorAnnotations?: Record<number, string>;
}) {
  const { areas, rows, trendOf, benchmarkNameFor, benchmarkCellFor } = comparisonTable(
    selected,
    geography,
    benchmark,
  );
  const slugs = new Map(selected.map(({ detail }) => [detail.shortId, detail.slug]));
  const noteTexts = [...new Set(rows.flatMap(({ cells }) => cells.flatMap(({ notes }) => notes)))];
  const benchmarkColumns = 1 + (showRange ? 3 : 0);
  const valueWithUnit = (row: (typeof rows)[number], value: number) =>
    withUnit(formatCalculatedValue(value), row.unit);
  return (
    <>
      {showRange && areas.some(({ areaCode }) => benchmarkNameFor(areaCode)) ? (
        <SpineChartKey />
      ) : null}
      <TableScrollRegion label={label}>
        <table className="govuk-table fphd-compare-table">
          <caption className="govuk-table__caption govuk-visually-hidden">{label}</caption>
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <td colSpan={2} />
              {areas.map(({ areaCode, areaName }) => (
                <Fragment key={areaCode}>
                  <th scope="colgroup" colSpan={3} className="govuk-table__header">
                    {areaName}
                  </th>
                  {benchmarkNameFor(areaCode) ? (
                    <th
                      scope="colgroup"
                      colSpan={benchmarkColumns}
                      className="govuk-table__header fphd-trend-table__benchmark-group"
                    >
                      {benchmarkNameFor(areaCode)}
                    </th>
                  ) : null}
                </Fragment>
              ))}
            </tr>
            <tr className="govuk-table__row">
              <th scope="col" className="govuk-table__header">
                Indicator
              </th>
              <th scope="col" className="govuk-table__header">
                Most recent period
              </th>
              {areas.map(({ areaCode }) => (
                <Fragment key={areaCode}>
                  <th scope="col" className="govuk-table__header">
                    Recent trend
                  </th>
                  <th scope="col" className="govuk-table__header">
                    Count <span className="fphd-table-note">(Raw number)</span>
                  </th>
                  <th scope="col" className="govuk-table__header">
                    Calculated value
                  </th>
                  {benchmarkNameFor(areaCode) ? (
                    <BenchmarkHeaderCells showRange={showRange} />
                  ) : null}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {rows.map((row) => (
              <tr className="govuk-table__row" key={row.key}>
                <td className="govuk-table__cell">
                  {indicatorLinks && slugs.get(row.shortId) ? (
                    <Link className="govuk-link" to={indicatorPath(slugs.get(row.shortId) ?? '')}>
                      {row.name}
                    </Link>
                  ) : (
                    row.name
                  )}
                  {row.suffix ? ` ${row.suffix}` : ''}
                  {indicatorAnnotations[row.shortId] ? (
                    <span className="fphd-table-note fphd-topic-subtopic">
                      {indicatorAnnotations[row.shortId]}
                    </span>
                  ) : null}
                </td>
                <td className="govuk-table__cell">{row.period || 'No data'}</td>
                {row.cells.map((cell) => {
                  const trend = trendOf(row, cell);
                  return (
                    <Fragment key={cell.areaCode}>
                      <td className="govuk-table__cell">
                        <TrendTag trend={trend} />
                      </td>
                      <td className="govuk-table__cell">
                        {cell.count === null ? '-' : formatValue(cell.count)}
                      </td>
                      <td className="govuk-table__cell">
                        {cell.value === null ? (
                          '-'
                        ) : (
                          <>
                            {valueWithUnit(row, cell.value)}
                            {cell.notes.map((text) => (
                              <sup key={text}>{noteMarker(noteTexts, text)}</sup>
                            ))}
                          </>
                        )}
                      </td>
                      {benchmarkNameFor(cell.areaCode)
                        ? (() => {
                            const benchmarkCell = benchmarkCellFor(row, cell);
                            return (
                              <BenchmarkCells
                                areaName={cell.areaName}
                                areaObservation={benchmarkCell?.areaObservation}
                                benchmarkName={benchmarkNameFor(cell.areaCode) ?? ''}
                                benchmarkValue={benchmarkCell?.value ?? null}
                                format={(value) => valueWithUnit(row, value)}
                                indicator={
                                  benchmarkCell?.detail ?? {
                                    polarity: 'no-comparison-possible',
                                    comparatorMethod: null,
                                  }
                                }
                                rangePeriod={benchmarkCell?.rangePeriod}
                                unit={row.unit}
                                showRange={showRange}
                              />
                            );
                          })()
                        : null}
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
