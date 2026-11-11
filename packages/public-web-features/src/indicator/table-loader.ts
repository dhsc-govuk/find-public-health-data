import {
  indicatorTableDataSchema,
  MAX_AREA_CODES_PER_REQUEST,
  MAX_TABLE_INDICATORS_PER_REQUEST,
  type ObservationHistory,
} from '@fphd/public-api-features/contract';
import { ENGLAND_AREA_CODE, type TableSeriesSelection } from '@fphd/utils/observation-series';
import type { ApiClient } from '@fphd/web-server/api-client';
import { loadInBatches } from './batches.ts';

export async function loadIndicatorTableEntries(
  api: ApiClient,
  shortIds: number[],
  areaCodes: string[],
  observationHistory: ObservationHistory = 'recentPerSeries',
) {
  const codes = areaCodes.includes(ENGLAND_AREA_CODE)
    ? [ENGLAND_AREA_CODE, ...areaCodes.filter((code) => code !== ENGLAND_AREA_CODE)]
    : areaCodes;
  const indicatorBatches = Array.from(
    { length: Math.ceil(shortIds.length / MAX_TABLE_INDICATORS_PER_REQUEST) },
    (_, index) =>
      shortIds.slice(
        index * MAX_TABLE_INDICATORS_PER_REQUEST,
        (index + 1) * MAX_TABLE_INDICATORS_PER_REQUEST,
      ),
  );
  const areaBatches = Array.from(
    { length: Math.ceil(codes.length / MAX_AREA_CODES_PER_REQUEST) },
    (_, index) =>
      codes.slice(index * MAX_AREA_CODES_PER_REQUEST, (index + 1) * MAX_AREA_CODES_PER_REQUEST),
  );
  return (
    await loadInBatches(indicatorBatches, async (ids) => {
      const parts = (
        await loadInBatches(areaBatches, (areas) => {
          const params = new URLSearchParams();
          for (const id of ids) params.append('indicator', String(id));
          for (const code of areas) params.append('areaCode', code);
          if (observationHistory === 'latestPerSeries')
            params.set('observationHistory', observationHistory);
          return api.get(`/api/indicator-data?${params}`, indicatorTableDataSchema);
        })
      ).flat();
      return ids.flatMap((id) => {
        const entries = parts.filter(({ detail }) => detail.shortId === id);
        const detail = entries[0]?.detail;
        if (!detail) return [];
        const byArea = new Map(
          entries.flatMap(({ areaData }) => areaData).map((area) => [area.areaCode, area]),
        );
        const tableSeries = new Map<string, TableSeriesSelection>();
        for (const entry of entries)
          for (const series of entry.tableSeries ?? []) {
            const { trends, rowOrder, ...selection } = series;
            const key = `${series.sex}|${series.periodType}`;
            const existing = tableSeries.get(key);
            tableSeries.set(key, {
              ...selection,
              segments: { ...existing?.segments, ...series.segments },
              ...(existing?.trends || trends ? { trends: { ...existing?.trends, ...trends } } : {}),
              ...(existing?.rowOrder || rowOrder
                ? { rowOrder: { ...existing?.rowOrder, ...rowOrder } }
                : {}),
            });
          }
        return [
          {
            detail,
            ...(tableSeries.size ? { tableSeries: [...tableSeries.values()] } : {}),
            areaData: areaCodes.flatMap((code) => {
              const area = byArea.get(code);
              return area ? [area] : [];
            }),
            regionData: [],
            ranges: {},
          },
        ];
      });
    })
  ).flat();
}
