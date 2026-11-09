import { areaDisplayGroupListSchema } from '@fphd/public-api-features/contract';
import type { ApiClient } from '@fphd/web-server/api-client';
import { areasInGeographyGroup } from '../../geography/groups.ts';
import type { SelectedIndicator } from '../loader.ts';
import { loadIndicatorTableEntries } from '../table-loader.ts';
import { englandCode, pairedObservations, scatterPair } from './chart-data.ts';

export async function loadScatterComparison(
  api: ApiClient,
  selected: SelectedIndicator[],
  params: URLSearchParams,
  areaCodes: string[],
  useDefaultGeographies = true,
) {
  const [x, y] = scatterPair(selected, params);
  if (!x || !y) return undefined;
  const chartAreas = areaCodes.filter((code) => code !== englandCode);
  if (chartAreas.length > 0 || !useDefaultGeographies) {
    const points = pairedObservations(x.areaData, y.areaData);
    if (
      useDefaultGeographies ||
      chartAreas.length === 0 ||
      points.some(({ code }) => code !== englandCode)
    ) {
      return { points, defaultGeographies: false };
    }
  }
  // Rankings can end in different periods; recent histories can still share a period.
  const groups = useDefaultGeographies
    ? await api.get('/api/areas?displayGroup=Local%20authorities', areaDisplayGroupListSchema)
    : [];
  const codes = useDefaultGeographies
    ? areasInGeographyGroup(
        groups.flatMap(({ areas }) => areas),
        'Upper-tier local authorities',
      ).map(({ code }) => code)
    : chartAreas;
  const [xData, yData] = await loadIndicatorTableEntries(
    api,
    [x.detail.shortId, y.detail.shortId],
    [englandCode, ...codes],
  );
  return {
    points: pairedObservations(xData?.areaData ?? [], yData?.areaData ?? []),
    defaultGeographies: useDefaultGeographies,
  };
}

export type ScatterComparison = NonNullable<Awaited<ReturnType<typeof loadScatterComparison>>>;
