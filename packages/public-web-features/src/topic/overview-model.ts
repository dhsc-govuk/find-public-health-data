import { availableMeasures, comparisonRows, MEASURES, recentTrend } from '../indicator/data.ts';
import type { SelectedIndicator } from '../indicator/loader.ts';

export function topicOverviewModel(selected: SelectedIndicator[]) {
  const rows = comparisonRows(selected);
  return selected.map(({ detail, areaData }) => {
    const row = rows.find(({ shortId }) => shortId === detail.shortId);
    const area = areaData.find(({ areaCode }) => areaCode !== 'E92000001') ?? areaData[0];
    const cell = row?.cells.find(({ areaCode }) => areaCode === area?.areaCode);
    const series = cell?.series ?? [];
    const latest = series.at(-1);
    const available = availableMeasures(series);
    const measures = MEASURES.filter(({ key }) => available.includes(key));
    return {
      shortId: detail.shortId,
      slug: detail.slug,
      name: detail.name,
      unit: detail.unit,
      areaName: area?.areaName ?? 'England',
      period: row?.period || 'No data',
      value: latest?.value ?? null,
      hasTrend: series.filter(({ value }) => value !== null).length >= 2,
      measures: (measures.length > 0 ? measures : MEASURES.slice(0, 1)).map(({ key, label }) => ({
        label,
        value: latest?.[key] ?? null,
      })),
      trend: recentTrend(series, detail.polarity, cell?.trendDirection),
    };
  });
}
