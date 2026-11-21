import {
  comparisonVariants,
  ENGLAND_AREA_CODE,
  observationSeriesKey,
} from '@fphd/utils/observation-series';
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
  const shown = selected.map((entry) => {
    const areaData = entry.areaData.filter((data) => data.areaCode === areaCode);
    const observations = areaData.flatMap(({ observations }) => observations);
    const firstVariant = comparisonVariants(observations)[0];
    const periodType =
      firstVariant && firstVariant.periodType !== 'all'
        ? firstVariant.periodType
        : (availablePeriodTypes(observations).at(-1) ?? '1-year');
    return {
      ...entry,
      areaData: areaData.map((data) => ({
        ...data,
        observations: filterObservations(data.observations, { periodType }),
      })),
    };
  });
  const rows = comparisonRows(shown.map(({ detail, areaData }) => ({ detail, areaData })));
  return shown.map(({ detail, areaData, tableSeries }) => {
    const row = rows.find(({ shortId }) => shortId === detail.shortId);
    const area = areaData[0];
    const cell = row?.cells.find(({ areaCode }) => areaCode === area?.areaCode);
    const periodType = availablePeriodTypes(cell?.series ?? []).at(-1) ?? '1-year';
    const series = filterObservations(cell?.series ?? [], { periodType }).sort(
      (a, b) => a.fromDate.localeCompare(b.fromDate) || a.toDate.localeCompare(b.toDate),
    );
    const latest = series.findLast(({ value }) => value !== null);
    const selection = tableSeries?.find(
      (selection) => selection.sex === row?.sex && selection.periodType === periodType,
    );
    const direction =
      area && latest && selection?.segments[area.areaCode] === observationSeriesKey(latest)
        ? selection.trends?.[area.areaCode]
        : undefined;
    return {
      shortId: detail.shortId,
      slug: detail.slug,
      name: detail.name,
      unit: detail.unit,
      ...sparklineModel(area ? [{ ...area, observations: series }] : [], detail.yearType),
      areaName: area?.areaName ?? (areaCode === ENGLAND_AREA_CODE ? 'England' : areaCode),
      period: latest ? expandedPeriodLabel(latest, detail.yearType) : 'No data',
      count: latest?.count ?? null,
      value: latest?.value ?? null,
      hasTrend: !!area && series.filter(({ value }) => value !== null).length >= 2,
      trend: recentTrend(series, detail.polarity, direction),
    };
  });
}
