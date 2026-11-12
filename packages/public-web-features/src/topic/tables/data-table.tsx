import { formatDate, TableScrollRegion } from '@fphd/ui';
import { indicatorPath } from '@fphd/utils/indicator-path';
import { memo } from 'react';
import { Link } from 'react-router';
import { formatCalculatedValue, formatValue, recentTrend, withUnit } from '../../indicator/data.ts';
import { TrendTag } from '../../indicator/trend-tag.tsx';
import { comparisonSummary, type TopicColumn } from '../data.ts';
import type { TopicDataTableModel } from '../table-models.ts';

type Measure = Extract<TopicColumn, 'trend' | 'count' | 'numerator' | 'value'>;
type Row = TopicDataTableModel['rows'][number];

function measureHeading(measure: Measure) {
  return measure === 'trend' ? (
    <>
      Trend
      <br />
      (last 5 periods)
    </>
  ) : measure === 'count' ? (
    'Count'
  ) : measure === 'numerator' ? (
    'Numerator'
  ) : (
    <>
      Calculated
      <br />
      value
    </>
  );
}

function measureValue(
  measure: Measure,
  cell: Partial<Row['cells'][number]> | null | undefined,
  unit: Row['unit'],
) {
  if (measure === 'trend') return <TrendTag trend={cell?.trend ?? recentTrend([], null)} />;
  if (measure === 'count' || measure === 'numerator') {
    return cell?.[measure] == null ? 'No data' : formatValue(cell[measure]);
  }
  return cell?.value == null ? 'No data' : withUnit(formatCalculatedValue(cell.value), unit);
}

export const TopicDataTable = memo(function TopicDataTable({
  model,
  title,
  columns = ['period', 'updated', 'trend', 'value'],
}: {
  model: TopicDataTableModel;
  title: string;
  columns?: TopicColumn[];
}) {
  const { rows, areas, compared } = model;
  const measures = columns.filter(
    (column): column is Measure =>
      column === 'trend' || column === 'count' || column === 'numerator' || column === 'value',
  );
  const englandMeasures = compared ? measures.filter((measure) => measure !== 'trend') : [];
  const grouped = compared || measures.length > 0;
  const areaNames = areas.map(({ name }) => name).join(', ');
  return (
    <TableScrollRegion label={`${title} indicators comparison table`}>
      <table className="govuk-table fphd-compare-table fphd-topic-data-table">
        <caption className="govuk-visually-hidden">
          {compared
            ? `${title} indicators: ${areaNames} compared with England`
            : `${title} indicators for ${areaNames || 'England'}`}
        </caption>
        <thead className="govuk-table__head">
          <tr className="govuk-table__row">
            <th className="govuk-table__header" scope="col" rowSpan={grouped ? 2 : 1}>
              Indicator
            </th>
            {columns.includes('period') ? (
              <th
                className="govuk-table__header fphd-topic-data-table__period"
                scope="col"
                rowSpan={grouped ? 2 : 1}
              >
                Most recent
                <br />
                period
              </th>
            ) : null}
            {columns.includes('updated') ? (
              <th
                className="govuk-table__header fphd-topic-data-table__updated"
                scope="col"
                rowSpan={grouped ? 2 : 1}
              >
                Last
                <br />
                updated
              </th>
            ) : null}
            {grouped
              ? areas.map((area) => (
                  <th
                    key={area.code}
                    scope="colgroup"
                    colSpan={measures.length + (compared ? 1 : 0)}
                    className="govuk-table__header"
                  >
                    {area.name}
                  </th>
                ))
              : null}
            {englandMeasures.length ? (
              <th scope="colgroup" colSpan={englandMeasures.length} className="govuk-table__header">
                England
              </th>
            ) : null}
          </tr>
          {grouped ? (
            <tr className="govuk-table__row">
              {areas.flatMap((area) => [
                ...measures.map((measure) => (
                  <th key={`${area.code}-${measure}`} scope="col" className="govuk-table__header">
                    {measureHeading(measure)}
                  </th>
                )),
                compared ? (
                  <th key={`${area.code}-comparison`} scope="col" className="govuk-table__header">
                    Comparison
                    <br />
                    summary
                  </th>
                ) : null,
              ])}
              {englandMeasures.map((measure) => (
                <th key={`england-${measure}`} scope="col" className="govuk-table__header">
                  {measureHeading(measure)}
                </th>
              ))}
            </tr>
          ) : null}
        </thead>
        <tbody className="govuk-table__body">
          {rows.map((row) => {
            return (
              <tr className="govuk-table__row" key={row.key}>
                <td className="govuk-table__cell">
                  <Link className="govuk-link" to={indicatorPath(row.slug)}>
                    {row.name}
                  </Link>
                  {row.suffix ? ` ${row.suffix}` : ''}
                  {row.subtopics.map((subtopic) => (
                    <span className="fphd-rug-cell__label fphd-topic-subtopic" key={subtopic}>
                      {subtopic}
                    </span>
                  ))}
                </td>
                {columns.includes('period') ? (
                  <td className="govuk-table__cell">{row.period || 'No data'}</td>
                ) : null}
                {columns.includes('updated') ? (
                  <td className="govuk-table__cell">
                    {row.updatedAt ? formatDate(row.updatedAt, 'short') : 'Not known'}
                  </td>
                ) : null}
                {areas.flatMap((area) => {
                  const cell = row.cells.find(({ areaCode }) => areaCode === area.code);
                  const period = cell?.period ? (
                    <span className="fphd-rug-cell__label">{cell.period}</span>
                  ) : null;
                  return [
                    ...measures.map((measure) => (
                      <td key={`${area.code}-${measure}`} className="govuk-table__cell">
                        {measureValue(measure, cell, row.unit)}
                        {measure === 'value' ? period : null}
                      </td>
                    )),
                    compared ? (
                      <td key={`${area.code}-comparison`} className="govuk-table__cell">
                        {cell?.value == null
                          ? 'No data'
                          : comparisonSummary(cell.judgement ?? 'none')}
                        {measures.includes('value') ? null : period}
                      </td>
                    ) : null,
                  ];
                })}
                {englandMeasures.map((measure) => (
                  <td key={`england-${measure}`} className="govuk-table__cell">
                    {measureValue(measure, row.england, row.unit)}
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
