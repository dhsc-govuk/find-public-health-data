import {
  areaComparisonBarMaximum,
  areaComparisonLabel,
  areaComparisonRows,
} from './area-comparison.ts';
import { indicatorPair } from './indicator-pair.ts';
import type { SelectedIndicator } from './loader.ts';
import type { loadIndicator } from './single-loader.ts';

export function indicatorComparisonModel(
  selected: SelectedIndicator[],
  comparison: Pick<
    Awaited<ReturnType<typeof loadIndicator>>,
    | 'compareAreasData'
    | 'comparedAreasData'
    | 'compareAreaOptions'
    | 'compareAreaGroup'
    | 'comparisonDisplayGroups'
  >,
) {
  const primary = selected[0];
  if (!primary) throw new Error('The indicator page needs one indicator');
  const {
    compareAreasData,
    comparedAreasData,
    compareAreaOptions,
    compareAreaGroup,
    comparisonDisplayGroups,
  } = comparison;
  const areas = areaComparisonRows(primary, compareAreasData, 'descending');
  const compared = selected[1];
  const forPair = (indicator: SelectedIndicator, areaData: SelectedIndicator['areaData']) => ({
    ...indicator,
    areaData: [
      ...indicator.areaData.filter(({ areaCode }) => areaCode === 'E92000001'),
      ...areaData.filter(({ areaCode }) => areaCode !== 'E92000001'),
    ],
  });
  const pair = compared
    ? indicatorPair([forPair(primary, compareAreasData), forPair(compared, comparedAreasData)])
    : undefined;
  return {
    compareAreaOptions,
    compareAreaGroup,
    comparisonDisplayGroups,
    areas: {
      period: areas.period,
      multiYear: areas.multiYear,
      barMaximum: areaComparisonBarMaximum(areas.rows),
      rows: areas.rows.map((cell) => ({
        areaCode: cell.areaCode,
        areaName: cell.areaName,
        value: cell.value,
        lowerCi95: cell.series.at(-1)?.lowerCi95 ?? null,
        upperCi95: cell.series.at(-1)?.upperCi95 ?? null,
        label: areaComparisonLabel(cell, areas.england, primary.detail),
      })),
    },
    pair: pair
      ? { periods: pair.periods, areas: pair.areas, england: pair.england, range: pair.range }
      : undefined,
  };
}

export type IndicatorComparisonModel = ReturnType<typeof indicatorComparisonModel>;
