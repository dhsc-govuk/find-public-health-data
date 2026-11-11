import { TableScrollRegion } from '@fphd/ui';
import { areaComparisonBarColour, areaComparisonGroups } from '../area-comparison.ts';
import type { IndicatorComparisonModel } from '../comparison-model.ts';
import { formatCalculatedValue } from '../data.ts';
import type { SelectedIndicator } from '../loader.ts';

export function AreaComparisonTable({
  indicator,
  model,
  sort,
  highlighted,
  colour = 'england',
}: {
  indicator: SelectedIndicator;
  model: IndicatorComparisonModel['areas'];
  sort: string;
  highlighted: string[];
  colour?: string;
}) {
  const shown = model.rows.toSorted((left, right) =>
    left.areaCode === 'E92000001'
      ? -1
      : right.areaCode === 'E92000001'
        ? 1
        : sort === 'alphabetical'
          ? left.areaName.localeCompare(right.areaName)
          : sort === 'ascending'
            ? (left.value ?? Number.POSITIVE_INFINITY) - (right.value ?? Number.POSITIVE_INFINITY)
            : (right.value ?? Number.NEGATIVE_INFINITY) - (left.value ?? Number.NEGATIVE_INFINITY),
  );
  const groups = areaComparisonGroups(shown, colour);
  const barMaximum = model.barMaximum;
  return (
    <TableScrollRegion label={`${indicator.detail.name} comparison across areas data table`}>
      <table className="govuk-table fphd-area-comparison-table">
        <caption className="govuk-table__caption">
          Table of area comparisons: {indicator.detail.name}
          <span className="govuk-visually-hidden"> by area</span>
        </caption>
        <thead className="govuk-table__head">
          <tr className="govuk-table__row">
            <th className="govuk-table__header" scope="col">
              Area
            </th>
            <th className="govuk-table__header" scope="col">
              Value <span className="fphd-table-unit">({indicator.detail.unit ?? 'number'})</span>
            </th>
            <th className="govuk-table__header" scope="col">
              {groups.heading}
            </th>
            <th className="govuk-table__header fphd-area-comparison-table__bar" scope="col">
              <span className="govuk-visually-hidden">Bar chart of value</span>
            </th>
            <th className="govuk-table__header" scope="col">
              95% lower confidence interval
            </th>
            <th className="govuk-table__header" scope="col">
              95% upper confidence interval
            </th>
          </tr>
        </thead>
        <tbody className="govuk-table__body">
          {shown.map((cell) => {
            const compare =
              colour === 'quartiles' || colour === 'quintiles'
                ? (groups.labels.get(cell.areaCode) ?? '')
                : cell.label;
            return (
              <tr
                className={`govuk-table__row${cell.areaCode === 'E92000001' ? ' fphd-area-comparison-table__benchmark' : ''}${highlighted.includes(cell.areaCode) ? ' fphd-highlighted-area' : ''}`}
                key={cell.areaCode}
              >
                <th className="govuk-table__header" scope="row">
                  {cell.areaName}
                  {cell.areaCode === 'E92000001' ? ' (benchmark)' : ''}
                </th>
                <td className="govuk-table__cell">{formatCalculatedValue(cell.value)}</td>
                <td className="govuk-table__cell">{compare}</td>
                <td
                  className="govuk-table__cell fphd-area-comparison-table__bar"
                  aria-hidden="true"
                >
                  {cell.value === null ? null : (
                    <svg
                      className="fphd-comparison-bar"
                      viewBox="0 0 100 20"
                      preserveAspectRatio="none"
                      height="20"
                      width="100%"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <title>{`${cell.areaName}: ${formatCalculatedValue(cell.value)} ${indicator.detail.unit ?? ''}${compare ? `, ${compare}` : ''}`}</title>
                      <rect width="100" height="20" fill="#f3f2f1" />
                      <rect
                        width={Math.max(0, (cell.value / barMaximum) * 100)}
                        height="20"
                        fill={areaComparisonBarColour(
                          compare,
                          colour,
                          cell.areaCode === 'E92000001',
                          indicator.detail.polarity === 'no-polarity',
                        )}
                        stroke={
                          colour === 'quartiles' || colour === 'quintiles' ? '#0b0c0c' : undefined
                        }
                        strokeWidth="0.5"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  )}
                </td>
                <td className="govuk-table__cell">
                  {cell.lowerCi95 == null ? '—' : formatCalculatedValue(cell.lowerCi95)}
                </td>
                <td className="govuk-table__cell">
                  {cell.upperCi95 == null ? '—' : formatCalculatedValue(cell.upperCi95)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScrollRegion>
  );
}
