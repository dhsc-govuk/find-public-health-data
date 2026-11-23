import {
  ENGLAND_AREA_CODE,
  headlineSeries,
  observationPeriodType,
  observationSeriesKey,
} from '@fphd/utils/observation-series';
import { expandedPeriodLabel } from '@fphd/utils/period-label';
import { sparklineModel } from '../indicator/charts/chart-data.ts';
import { comparisonRows, filterObservations, recentTrend } from '../indicator/data.ts';
import type { SelectedIndicator } from '../indicator/loader.ts';

export function topicOverviewModel(
  selected: SelectedIndicator[],
  areaCode = ENGLAND_AREA_CODE,
  areaName = 'England',
) {
  return selected.map((entry) => {
    const area = entry.areaData.find((data) => data.areaCode === areaCode);
    const observations = area?.observations ?? [];
    const selection =
      entry.tableSeries?.find((selection) => selection.headlines?.[areaCode]) ??
      entry.tableSeries?.find(
        (selection) => selection.periodType === 'all' && selection.segments[areaCode],
      );
    const reference = selection
      ? observations.find((point) => observationSeriesKey(point) === selection.segments[areaCode])
      : headlineSeries(observations)[0];
    const periodType = reference ? observationPeriodType(reference) : '1-year';
    const shown = {
      ...entry,
      areaData: area
        ? [{ ...area, observations: filterObservations(observations, { periodType }) }]
        : [],
    };
    const rows = comparisonRows([shown]);
    const row = rows.find((row) =>
      selection
        ? row.sex === selection.sex && row.periodType === selection.periodType
        : row.series.some(
            (point) => reference && observationSeriesKey(point) === observationSeriesKey(reference),
          ),
    );
    const cell = row?.cells.find((cell) => cell.areaCode === areaCode);
    const series = [...(cell?.series ?? [])].sort(
      (a, b) => a.fromDate.localeCompare(b.fromDate) || a.toDate.localeCompare(b.toDate),
    );
    const latest = series.findLast(({ value }) => value !== null);
    const detail = entry.detail;
    return {
      shortId: detail.shortId,
      slug: detail.slug,
      name: detail.name,
      unit: detail.unit,
      ...sparklineModel(area ? [{ ...area, observations: series }] : [], detail.yearType),
      areaName: area?.areaName ?? areaName,
      period: latest ? expandedPeriodLabel(latest, detail.yearType) : 'No data',
      count: latest?.count ?? null,
      value: latest?.value ?? null,
      hasTrend: !!area && series.filter(({ value }) => value !== null).length >= 2,
      trend: recentTrend(series, detail.polarity, cell?.trendDirection),
    };
  });
}
