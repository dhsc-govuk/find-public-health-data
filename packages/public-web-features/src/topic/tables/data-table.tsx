import { formatDate, TableScrollRegion, TableSize } from '@fphd/ui';
import { indicatorPath } from '@fphd/utils/indicator-path';
import { memo, type ReactNode, useId } from 'react';
import { Link } from 'react-router';
import { SpineChart } from '../../indicator/charts/spine-chart.tsx';
import { formatCalculatedValue, formatValue, recentTrend, withUnit } from '../../indicator/data.ts';
import { TrendTag } from '../../indicator/trend-tag.tsx';
import {
  comparisonSummary,
  DEFAULT_TOPIC_COLUMNS,
  type TopicColumn,
  type TopicEnglandMeasure,
  topicEnglandMeasures,
} from '../data.ts';
import type { TopicDataTableModel } from '../table-models.ts';

type Measure = Extract<TopicColumn, 'trend' | 'count' | 'numerator' | 'value'>;
type AreaColumn = Measure | 'chart' | 'summary';
type Row = TopicDataTableModel['rows'][number];
type Cell = Row['cells'][number];

const MEASURES: Measure[] = ['trend', 'count', 'numerator', 'value'];

// The prototype's column widths, in pixels.
const AREA_WIDTHS: Record<AreaColumn, number> = {
  trend: 150,
  count: 100,
  numerator: 100,
  value: 150,
  chart: 243,
  summary: 110,
};
const ENGLAND_ONLY_WIDTHS: Record<Measure, number> = {
  trend: 150,
  count: 120,
  numerator: 120,
  value: 150,
};
const ENGLAND_WIDTHS: Record<TopicEnglandMeasure, number> = {
  min: 90,
  p25: 110,
  p75: 110,
  max: 90,
  count: 100,
  numerator: 100,
  value: 150,
};

const HEADINGS: Record<AreaColumn | TopicEnglandMeasure, ReactNode> = {
  trend: (
    <>
      Trend
      <br />
      (last 5 periods)
    </>
  ),
  count: 'Count',
  numerator: 'Numerator',
  value: (
    <>
      Calculated
      <br />
      value
    </>
  ),
  chart: (
    <>
      Compared
      <br />
      with England
    </>
  ),
  summary: (
    <>
      Comparison
      <br />
      summary
    </>
  ),
  min: 'England lowest',
  p25: 'England 25th percentile',
  p75: 'England 75th percentile',
  max: 'England highest',
};

function NoData() {
  return (
    <>
      <span aria-hidden="true">-</span>
      <span className="govuk-visually-hidden">No data</span>
    </>
  );
}

function measureValue(
  measure: Measure | TopicEnglandMeasure,
  cell: Partial<Cell> | Partial<NonNullable<Row['england']>> | null | undefined,
  unit: Row['unit'],
) {
  if (measure === 'trend') {
    return <TrendTag trend={(cell as Partial<Cell>)?.trend ?? recentTrend([], null)} />;
  }
  const value = (cell as Record<string, number | null | undefined> | null | undefined)?.[measure];
  if (value == null) return <NoData />;
  return measure === 'count' || measure === 'numerator'
    ? formatValue(value)
    : withUnit(formatCalculatedValue(value), unit);
}

function ComparisonChart({ areaName, cell, row }: { areaName: string; cell: Cell; row: Row }) {
  const benchmarkValue = cell.benchmark?.value ?? (cell.period ? null : row.england?.value) ?? null;
  const { range } = cell;
  if (cell.value == null || benchmarkValue == null || !range) return <NoData />;
  const label = (value: number) => withUnit(formatCalculatedValue(value), row.unit);
  return (
    <SpineChart
      value={cell.value}
      benchmarkValue={benchmarkValue}
      min={range.min}
      max={range.max}
      p25={range.p25}
      p75={range.p75}
      unit={row.unit}
      judgement={cell.judgement ?? 'none'}
      valueLabel={`${areaName}: ${label(cell.value)}`}
      benchmarkLabel={`England: ${label(benchmarkValue)}`}
      rangeLabel={`Range: ${label(range.min)} to ${label(range.max)}`}
    />
  );
}

export const TopicDataTable = memo(function TopicDataTable({
  model,
  title,
  columns = DEFAULT_TOPIC_COLUMNS,
  id,
}: {
  model: TopicDataTableModel;
  title: string;
  columns?: TopicColumn[];
  id?: string;
}) {
  const prefix = useId();
  const { rows, areas, compared } = model;
  const measures = MEASURES.filter((measure) => columns.includes(measure));
  const areaColumns: AreaColumn[] = [
    ...measures,
    ...(compared ? (['chart', 'summary'] as const).filter((key) => columns.includes(key)) : []),
  ];
  const englandMeasures = topicEnglandMeasures(columns, compared);
  const grouped = areaColumns.length > 0 || englandMeasures.length > 0;
  const names = areas.map(({ name }) => name);
  const areaList =
    names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const leading = [
    { key: 'indicator', label: 'Indicator', className: 'fphd-table__frozen' },
    ...(columns.includes('period')
      ? [
          {
            key: 'period',
            label: (
              <>
                Most recent
                <br />
                period
              </>
            ),
            className:
              'fphd-topic-data-table__period fphd-table__frozen fphd-table__frozen--second',
          },
        ]
      : []),
    ...(columns.includes('updated')
      ? [
          {
            key: 'updated',
            label: (
              <>
                Data last
                <br />
                updated
              </>
            ),
            className: 'fphd-topic-data-table__updated',
          },
        ]
      : []),
  ];
  const widths = [
    ...leading.slice(1).map(({ key }) => (key === 'updated' ? 90 : compared ? 100 : 110)),
    ...areas.flatMap(() =>
      areaColumns.map((key) =>
        compared || key === 'chart' || key === 'summary'
          ? AREA_WIDTHS[key]
          : ENGLAND_ONLY_WIDTHS[key],
      ),
    ),
    ...englandMeasures.map((measure) => ENGLAND_WIDTHS[measure]),
  ];
  const others = widths.reduce((total, width) => total + width, 0);
  const indicatorWidth = Math.min(compared ? 500 : 680, Math.round(others / 3) || Infinity);
  const columnCount = leading.length + areas.length * areaColumns.length + englandMeasures.length;
  const groupId = (code: string) => `${prefix}-${code}`;
  const columnId = (code: string, key: string) => `${prefix}-${code}-${key}`;
  return (
    <TableScrollRegion label={`${title} indicators comparison table`}>
      <table
        id={id ?? `${prefix}-table`}
        tabIndex={-1}
        className="govuk-table fphd-compare-table fphd-topic-data-table"
      >
        <caption className="govuk-table__caption govuk-table__caption--s">
          {compared
            ? `${title} indicators: ${areaList} compared with England`
            : `${title} indicators for England`}
          <TableSize rows={rows.length} columns={columnCount} />
        </caption>
        <colgroup>
          {/* Width attributes, not styles: the content security policy blocks inline styles. */}
          <col className="fphd-topic-data-table__indicator-column" width={indicatorWidth} />
          {widths.map((width, index) => (
            <col key={index} width={width} />
          ))}
        </colgroup>
        <thead className="govuk-table__head">
          {grouped ? (
            <tr className="govuk-table__row">
              {leading.map(({ key, className }) => (
                <td key={key} aria-hidden="true" className={`govuk-table__cell ${className}`} />
              ))}
              {areaColumns.length
                ? areas.map((area) => (
                    <th
                      id={groupId(area.code)}
                      key={area.code}
                      scope="colgroup"
                      colSpan={areaColumns.length}
                      className="govuk-table__header"
                    >
                      {area.name}
                    </th>
                  ))
                : null}
              {englandMeasures.length ? (
                <th
                  id={groupId('england')}
                  scope="colgroup"
                  colSpan={englandMeasures.length}
                  className="govuk-table__header fphd-trend-table__benchmark-group"
                >
                  England
                </th>
              ) : null}
            </tr>
          ) : null}
          <tr className="govuk-table__row">
            {leading.map(({ key, label, className }) => (
              <th
                id={`${prefix}-${key}`}
                key={key}
                scope="col"
                className={`govuk-table__header ${className}`}
              >
                {label}
              </th>
            ))}
            {areas.flatMap((area) =>
              areaColumns.map((key) => (
                <th
                  id={columnId(area.code, key)}
                  key={`${area.code}-${key}`}
                  scope="col"
                  className="govuk-table__header"
                >
                  {HEADINGS[key]}
                </th>
              )),
            )}
            {englandMeasures.map((measure) => (
              <th
                id={columnId('england', measure)}
                key={`england-${measure}`}
                scope="col"
                className="govuk-table__header fphd-trend-table__benchmark-cell"
              >
                {HEADINGS[measure]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="govuk-table__body">
          {rows.map((row, index) => {
            const rowId = `${prefix}-row-${index}`;
            return (
              <tr className="govuk-table__row" key={row.key}>
                <th id={rowId} scope="row" className="govuk-table__header fphd-table__frozen">
                  <Link className="govuk-link" to={indicatorPath(row.slug)}>
                    {row.name}
                  </Link>
                  {row.suffix ? ` ${row.suffix}` : ''}
                  {row.subtopics.map((subtopic) => (
                    <span
                      className="govuk-hint govuk-body-s govuk-!-margin-top-1 govuk-!-margin-bottom-0 fphd-topic-subtopic"
                      key={subtopic}
                    >
                      {subtopic}
                    </span>
                  ))}
                </th>
                {columns.includes('period') ? (
                  <td
                    headers={`${rowId} ${prefix}-period`}
                    className="govuk-table__cell fphd-table__frozen fphd-table__frozen--second"
                  >
                    {row.period && row.period !== 'No data' ? row.period : <NoData />}
                  </td>
                ) : null}
                {columns.includes('updated') ? (
                  <td headers={`${rowId} ${prefix}-updated`} className="govuk-table__cell">
                    {row.updatedAt ? formatDate(row.updatedAt, 'short') : 'Not known'}
                  </td>
                ) : null}
                {areas.flatMap((area) => {
                  const cell = row.cells.find(({ areaCode }) => areaCode === area.code);
                  // An area whose latest data is older than the row's says which period it shows.
                  const period = cell?.period ? (
                    <span className="govuk-hint govuk-body-s govuk-!-margin-bottom-0 fphd-topic-subtopic">
                      ({cell.period})
                    </span>
                  ) : null;
                  return areaColumns.map((key) => (
                    <td
                      key={`${area.code}-${key}`}
                      headers={`${rowId} ${groupId(area.code)} ${columnId(area.code, key)}`}
                      className={`govuk-table__cell${key === 'chart' ? ' fphd-table__chart-cell' : ''}`}
                    >
                      {key === 'chart' ? (
                        cell ? (
                          <ComparisonChart areaName={area.name} cell={cell} row={row} />
                        ) : (
                          <NoData />
                        )
                      ) : key === 'summary' ? (
                        cell?.value == null ? (
                          <NoData />
                        ) : (
                          <>
                            {comparisonSummary(cell.judgement, cell.benchmark, row.unit)}
                            {measures.includes('value') ? null : period}
                          </>
                        )
                      ) : (
                        <>
                          {measureValue(key, cell, row.unit)}
                          {key === 'trend' ? null : period}
                        </>
                      )}
                    </td>
                  ));
                })}
                {englandMeasures.map((measure) => (
                  <td
                    key={`england-${measure}`}
                    headers={`${rowId} ${groupId('england')} ${columnId('england', measure)}`}
                    className="govuk-table__cell fphd-trend-table__benchmark-cell"
                  >
                    {measureValue(measure, row.england, row.unit)}
                    {!columns.includes('period') &&
                    (measure === 'count' || measure === 'numerator' || measure === 'value') &&
                    row.england?.[measure] != null &&
                    row.period ? (
                      <span className="govuk-hint govuk-body-s govuk-!-margin-bottom-0 fphd-topic-subtopic">
                        {row.period}
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScrollRegion>
  );
});
