import { Details, TableScrollRegion } from '@fphd/ui';
import { geographyGroupLabel } from '../../geography/groups.ts';
import type { IndicatorComparisonModel } from '../comparison-model.ts';
import { formatCalculatedValue, withUnit } from '../data.ts';
import type { IndicatorDetail } from '../loader.ts';

export function IndicatorPairTable({
  indicators,
  model,
  group = 'Local authorities',
  highlighted = [],
}: {
  indicators: [Pick<IndicatorDetail, 'name' | 'unit'>, Pick<IndicatorDetail, 'name' | 'unit'>];
  model: NonNullable<IndicatorComparisonModel['pair']>;
  group?: string;
  highlighted?: string[];
}) {
  const [first, second] = indicators;
  const displayValue = (value: number | null, index: number) =>
    value === null
      ? 'No data'
      : withUnit(formatCalculatedValue(value), indicators[index]?.unit ?? null);
  const { periods, england, areas } = model;
  const shown = [
    ...(england ? [england] : []),
    ...areas.filter(({ code }) => highlighted.includes(code)),
  ];
  const row = (cell: (typeof areas)[number]) => (
    <tr className="govuk-table__row" key={cell.code}>
      <th className="govuk-table__header" scope="row">
        {cell.name}
      </th>
      {cell.values.map((value, index) => (
        <td className="govuk-table__cell" key={index}>
          {displayValue(value, index)}
        </td>
      ))}
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
          </tbody>
        </table>
      </TableScrollRegion>
      {areas.length ? (
        <Details summary={`Show data for all ${areas.length} ${geographyGroupLabel(group)}`}>
          <TableScrollRegion label="All areas in the indicator comparison">
            <table className="govuk-table">
              <caption className="govuk-visually-hidden">
                All {geographyGroupLabel(group)} in the comparison
              </caption>
              <thead className="govuk-table__head">
                <tr>
                  <th scope="col" className="govuk-table__header">
                    Area
                  </th>
                  <th scope="col" className="govuk-table__header">
                    {first.name}
                  </th>
                  <th scope="col" className="govuk-table__header">
                    {second.name}
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
