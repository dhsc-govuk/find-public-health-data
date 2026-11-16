import { and, asc, eq, inArray } from 'drizzle-orm';

import type { Database } from './client.ts';
import {
  publishedClassification,
  publishedIndicatorClassification,
  publishedIndicatorSubtopic,
  publishedIndicatorTopic,
  publishedSubtopic,
  publishedTopic,
} from './schema/index.ts';

export interface TopicSummaryForIndicator {
  slug: string;
  title: string;
  subtopics?: { slug: string; title: string }[];
}

export interface IndicatorClassification {
  dimension: string;
  slug: string;
  name: string;
}

/** The topics a published indicator belongs to, ordered by title. */
export async function listTopicsForIndicator(
  db: Database,
  indicatorId: string,
): Promise<TopicSummaryForIndicator[]> {
  return (await listTopicsForIndicators(db, [indicatorId])).get(indicatorId) ?? [];
}

export async function listTopicsForIndicators(
  db: Database,
  indicatorIds: string[],
): Promise<Map<string, TopicSummaryForIndicator[]>> {
  if (!indicatorIds.length) return new Map();
  const rows = await db
    .select({
      indicatorId: publishedIndicatorTopic.indicatorId,
      slug: publishedTopic.slug,
      title: publishedTopic.title,
      subtopicSlug: publishedSubtopic.slug,
      subtopicTitle: publishedSubtopic.title,
    })
    .from(publishedIndicatorTopic)
    .innerJoin(publishedTopic, eq(publishedIndicatorTopic.topicId, publishedTopic.id))
    .leftJoin(
      publishedIndicatorSubtopic,
      and(
        eq(publishedIndicatorSubtopic.indicatorId, publishedIndicatorTopic.indicatorId),
        eq(publishedIndicatorSubtopic.topicId, publishedIndicatorTopic.topicId),
      ),
    )
    .leftJoin(publishedSubtopic, eq(publishedIndicatorSubtopic.subtopicId, publishedSubtopic.id))
    .where(inArray(publishedIndicatorTopic.indicatorId, indicatorIds))
    .orderBy(asc(publishedTopic.title), asc(publishedSubtopic.title));
  const byIndicator = new Map<string, Map<string, Required<TopicSummaryForIndicator>>>();
  for (const row of rows) {
    const topics =
      byIndicator.get(row.indicatorId) ?? new Map<string, Required<TopicSummaryForIndicator>>();
    const entry: Required<TopicSummaryForIndicator> = topics.get(row.slug) ?? {
      slug: row.slug,
      title: row.title,
      subtopics: [],
    };
    if (row.subtopicSlug !== null && row.subtopicTitle !== null)
      entry.subtopics.push({ slug: row.subtopicSlug, title: row.subtopicTitle });
    topics.set(row.slug, entry);
    byIndicator.set(row.indicatorId, topics);
  }
  return new Map([...byIndicator].map(([id, topics]) => [id, [...topics.values()]]));
}

/** A published indicator's classifications, grouped ready for the summary table. */
export async function listClassificationsForIndicator(
  db: Database,
  indicatorId: string,
): Promise<IndicatorClassification[]> {
  return (await listClassificationsForIndicators(db, [indicatorId])).get(indicatorId) ?? [];
}

export async function listClassificationsForIndicators(
  db: Database,
  indicatorIds: string[],
): Promise<Map<string, IndicatorClassification[]>> {
  if (!indicatorIds.length) return new Map();
  const rows = await db
    .select({
      indicatorId: publishedIndicatorClassification.indicatorId,
      dimension: publishedClassification.dimension,
      slug: publishedClassification.slug,
      name: publishedClassification.name,
    })
    .from(publishedIndicatorClassification)
    .innerJoin(
      publishedClassification,
      eq(publishedIndicatorClassification.classificationId, publishedClassification.id),
    )
    .where(inArray(publishedIndicatorClassification.indicatorId, indicatorIds))
    .orderBy(asc(publishedClassification.dimension), asc(publishedClassification.name));
  const groups = new Map<string, IndicatorClassification[]>();
  for (const { indicatorId, ...value } of rows) {
    const values = groups.get(indicatorId) ?? [];
    values.push(value);
    groups.set(indicatorId, values);
  }
  return groups;
}
