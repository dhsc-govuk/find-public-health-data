import { inArray } from 'drizzle-orm';
import type { Database } from './client.ts';
import {
  completeIndicatorDetail,
  getIndicatorDetailsByIds,
  getIndicatorObservationData,
} from './indicator-repository.ts';
import { getIndicatorSeriesData } from './indicator-series-repository.ts';
import type { ViewSet } from './schema/index.ts';

export async function getIndicatorRankingData(
  db: Database,
  views: ViewSet,
  indicatorId: string,
  areaCodes: string[],
) {
  const data =
    (await getIndicatorSeriesData(db, views, [indicatorId], areaCodes, 'ranking', true)) ??
    (await getIndicatorObservationData(db, views, [indicatorId], areaCodes, 'ranking'));
  return data.get(indicatorId)?.areaData ?? [];
}

export async function getIndicatorTableData(
  db: Database,
  views: ViewSet,
  shortIds: number[],
  areaCodes: string[],
  points: 'recent' | 'latest' | 'sparkline' = 'recent',
) {
  const { indicator: publishedIndicator } = views;
  if (!shortIds.length || !areaCodes.length) return [];
  const identities = await db
    .select({ id: publishedIndicator.id, shortId: publishedIndicator.shortId })
    .from(publishedIndicator)
    .where(inArray(publishedIndicator.shortId, shortIds));
  const ids = identities.map(({ id }) => id);
  const [details, data] = await Promise.all([
    getIndicatorDetailsByIds(db, views, ids),
    getIndicatorSeriesData(db, views, ids, areaCodes, points).then(
      (cached) =>
        cached ??
        getIndicatorObservationData(
          db,
          views,
          ids,
          areaCodes,
          points === 'latest' ? 'summary' : points === 'sparkline' ? 'sparkline' : 'table',
        ),
    ),
  ]);
  const byShortId = new Map(identities.map(({ id, shortId }) => [shortId, id]));
  return shortIds.flatMap((shortId) => {
    const id = byShortId.get(shortId);
    const found = id ? details.get(id) : undefined;
    // The table data answers only for indicators the public page could show.
    const detail = found && completeIndicatorDetail(found);
    const observations = id ? data.get(id) : undefined;
    return detail && observations ? [{ detail, ...observations }] : [];
  });
}
