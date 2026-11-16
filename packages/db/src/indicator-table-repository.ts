import { inArray } from 'drizzle-orm';
import type { Database } from './client.ts';
import {
  getIndicatorObservationData,
  getPublishedIndicatorsByIds,
} from './indicator-repository.ts';
import { getIndicatorSeriesData } from './indicator-series-repository.ts';
import { publishedIndicator } from './schema/index.ts';

export async function getIndicatorRankingData(
  db: Database,
  indicatorId: string,
  areaCodes: string[],
) {
  const data =
    (await getIndicatorSeriesData(db, [indicatorId], areaCodes, 'ranking', true)) ??
    (await getIndicatorObservationData(db, [indicatorId], areaCodes, 'ranking'));
  return data.get(indicatorId)?.areaData ?? [];
}

export async function getIndicatorTableData(
  db: Database,
  shortIds: number[],
  areaCodes: string[],
  points: 'recent' | 'latest' | 'sparkline' = 'recent',
) {
  if (!shortIds.length || !areaCodes.length) return [];
  const identities = await db
    .select({ id: publishedIndicator.id, shortId: publishedIndicator.shortId })
    .from(publishedIndicator)
    .where(inArray(publishedIndicator.shortId, shortIds));
  const ids = identities.map(({ id }) => id);
  const [details, data] = await Promise.all([
    getPublishedIndicatorsByIds(db, ids),
    getIndicatorSeriesData(db, ids, areaCodes, points).then(
      (cached) =>
        cached ??
        getIndicatorObservationData(
          db,
          ids,
          areaCodes,
          points === 'latest' ? 'summary' : points === 'sparkline' ? 'sparkline' : 'table',
        ),
    ),
  ]);
  const byShortId = new Map(identities.map(({ id, shortId }) => [shortId, id]));
  return shortIds.flatMap((shortId) => {
    const id = byShortId.get(shortId);
    const detail = id ? details.get(id) : undefined;
    const observations = id ? data.get(id) : undefined;
    return detail && observations ? [{ detail, ...observations }] : [];
  });
}
