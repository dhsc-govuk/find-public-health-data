import { Details, TableScrollRegion } from '@fphd/ui';
import { geographyGroupLabel } from '../../geography/groups.ts';
import type { IndicatorComparisonModel } from '../comparison-model.ts';
import { formatCalculatedValue, withUnit } from '../data.ts';
import type { IndicatorPageDetail } from '../loader.ts';

export function IndicatorPairTable({
  indicators,
  model,
  group = 'Local authorities',
  highlighted = [],
  correlation,
  plotted = false,
}: {
  indicators: [
    Pick<IndicatorPageDetail, 'name' | 'unit'>,
    Pick<IndicatorPageDetail, 'name' | 'unit'>,
  ];
  model: NonNullable<IndicatorComparisonModel['pair']>;
  group?: string;
  highlighted?: string[];
  correlation?: number | undefined;
  plotted?: boolean;
}) {
  const [first, second] = indicators;
  const allAreas = plotted ? `areas plotted (${group})` : geographyGroupLabel(group);
  const displayValue = (value: number | null, index: number) =>
    value === null
      ? 'No data'
      : withUnit(formatCalculatedValue(value), indicators[index]?.unit ?? null);
  const { periods, england, areas } = model;
  const shown = [
    ...(england ? [england] : []),
    ...areas.filter(({ code }) => highlighted.includes(code)),
  ];
  // A value from a different period to its column's heading says which period it is for.
  const row = (cell: (typeof areas)[number] & { periods?: string[] }) => (
    <tr className="govuk-table__row" key={cell.code}>
      <th className="govuk-table__header" scope="row">
        {cell.name}
      </th>
      {cell.values.map((value, index) => {
        const period = cell.periods?.[index];
        return (
          <td className="govuk-table__cell" key={index}>
            {displayValue(value, index)}
            {value !== null && period && period !== periods[index] ? ` (${period})` : null}
          </td>
        );
      })}
    </tr>
  );
  return (
    <>
      <TableScrollRegion label="Indicator comparison data table">
        <table className="govuk-table fphd-compare-table">
          <caption className="govuk-table__caption">
            Table of indicator comparison: {first.name} and {second.name}
          </caption>
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th className="govuk-table__header" scope="col">
                Area
              </th>
              <th className="govuk-table__header" scope="col">
                {first.name} ({periods[0] || 'latest period'})
              </th>
              <th className="govuk-table__header" scope="col">
                {second.name} ({periods[1] || 'latest period'})
              </th>
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {shown.map(row)}
            {areas.length ? (
              <tr className="govuk-table__row">
                <th className="govuk-table__header" scope="row">
                  {group} ({areas.length} areas)
                </th>
                {model.range.map((range, index) => (
                  <td className="govuk-table__cell" key={index}>
                    {range}
                  </td>
                ))}
              </tr>
            ) : null}
            {correlation !== undefined ? (
              <tr className="govuk-table__row">
                <th className="govuk-table__header" scope="row">
                  Correlation (r, estimated)
                </th>
                <td className="govuk-table__cell" colSpan={2}>
                  {correlation.toFixed(2)}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableScrollRegion>
      {areas.length ? (
        <Details summary={`Show data for all ${areas.length} ${allAreas}`}>
          <TableScrollRegion label="All areas in the indicator comparison">
            <table className="govuk-table">
              <caption className="govuk-visually-hidden">All {allAreas} in the comparison</caption>
              <thead className="govuk-table__head">
                <tr>
                  <th scope="col" className="govuk-table__header">
                    Area
                  </th>
                  <th scope="col" className="govuk-table__header">
                    {first.name} ({periods[0] || 'latest period'})
                  </th>
                  <th scope="col" className="govuk-table__header">
                    {second.name} ({periods[1] || 'latest period'})
                  </th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">{areas.map(row)}</tbody>
            </table>
          </TableScrollRegion>
        </Details>
      ) : null}
    </>
  );
}
