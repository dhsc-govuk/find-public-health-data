import { ENGLAND_AREA_CODE, observationSegmentKey } from '@fphd/utils/observation-series';
import { expandedPeriodLabel } from '@fphd/utils/period-label';
import { sparklineModel } from '../indicator/charts/chart-data.ts';
import {
  availablePeriodTypes,
  comparisonRows,
  filterObservations,
  recentTrend,
} from '../indicator/data.ts';
import type { SelectedIndicator } from '../indicator/loader.ts';

export function topicOverviewModel(selected: SelectedIndicator[], areaCode = ENGLAND_AREA_CODE) {
  // The comparison rows give England a cell only when no other area is loaded beside it.
  const shown =
    areaCode === ENGLAND_AREA_CODE
      ? selected.map((entry) => ({
          ...entry,
          areaData: entry.areaData.filter((data) => data.areaCode === ENGLAND_AREA_CODE),
        }))
      : selected;
  const rows = comparisonRows(shown);
  return shown.map(({ detail, areaData, tableSeries }) => {
    const row = rows.find(({ shortId }) => shortId === detail.shortId);
    const area = areaData.find((entry) => entry.areaCode === areaCode) ?? areaData[0];
    const cell = row?.cells.find(({ areaCode }) => areaCode === area?.areaCode);
    const periodType = availablePeriodTypes(cell?.series ?? []).includes('3-year')
      ? '3-year'
      : '1-year';
    const series = filterObservations(cell?.series ?? [], { periodType }).sort(
      (a, b) => a.fromDate.localeCompare(b.fromDate) || a.toDate.localeCompare(b.toDate),
    );
    const latest = series.findLast(({ value }) => value !== null);
    const selection = tableSeries?.find(
      (selection) => selection.sex === row?.sex && selection.periodType === periodType,
    );
    const direction =
      area && latest && selection?.segments[area.areaCode] === observationSegmentKey(latest)
        ? selection.trends?.[area.areaCode]
        : undefined;
    return {
      shortId: detail.shortId,
      slug: detail.slug,
      name: detail.name,
      unit: detail.unit,
      ...sparklineModel(area ? [{ ...area, observations: series }] : [], detail.yearType),
      period: latest ? expandedPeriodLabel(latest, detail.yearType) : 'No data',
      count: latest?.count ?? null,
      value: latest?.value ?? null,
      hasTrend: !!area && series.filter(({ value }) => value !== null).length >= 2,
      trend: recentTrend(series, detail.polarity, direction),
    };
  });
}
