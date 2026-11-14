import { observationSegmentKey } from '@fphd/utils/observation-series';
import { expandedPeriodLabel } from '@fphd/utils/period-label';
import { sparklineModel } from '../indicator/charts/chart-data.ts';
import {
  availablePeriodTypes,
  comparisonRows,
  filterObservations,
  recentTrend,
} from '../indicator/data.ts';
import type { SelectedIndicator } from '../indicator/loader.ts';

export function topicOverviewModel(selected: SelectedIndicator[]) {
  const rows = comparisonRows(selected);
  return selected.map(({ detail, areaData, tableSeries }) => {
    const row = rows.find(({ shortId }) => shortId === detail.shortId);
    const area = areaData.find(({ areaCode }) => areaCode !== 'E92000001') ?? areaData[0];
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
      count: latest?.count ?? latest?.numerator ?? null,
      value: latest?.value ?? null,
      hasTrend: !!area && series.filter(({ value }) => value !== null).length >= 2,
      trend: recentTrend(series, detail.polarity, direction),
    };
  });
}
