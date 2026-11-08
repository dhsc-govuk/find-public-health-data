import { asc, eq, sql } from 'drizzle-orm';

import type { Database } from './client.ts';
import { publishedClassification, publishedSubtopic, publishedTopic } from './schema/index.ts';

/** A topic, subtopic or classification, as the public API lists them together as tags. */
export type TagRow =
  | { kind: 'topic'; slug: string; name: string }
  | { kind: 'subtopic'; slug: string; name: string; topicSlug: string }
  | { kind: 'classification'; slug: string; name: string; dimension: string };

export async function listTags(db: Database): Promise<TagRow[]> {
  const [topics, subtopics, classifications] = await Promise.all([
    db
      .select({ slug: publishedTopic.slug, name: publishedTopic.title })
      .from(publishedTopic)
      .orderBy(asc(publishedTopic.title)),
    db
      .select({
        slug: publishedSubtopic.slug,
        name: publishedSubtopic.title,
        topicSlug: publishedTopic.slug,
      })
      .from(publishedSubtopic)
      .innerJoin(publishedTopic, eq(publishedSubtopic.topicId, publishedTopic.id))
      .orderBy(asc(publishedTopic.title), asc(publishedSubtopic.title)),
    db
      .select({
        slug: publishedClassification.slug,
        name: publishedClassification.name,
        dimension: publishedClassification.dimension,
      })
      .from(publishedClassification)
      .orderBy(asc(publishedClassification.dimension), asc(publishedClassification.name)),
  ]);

  return [
    ...topics.map((row) => ({ kind: 'topic' as const, ...row })),
    ...subtopics.map((row) => ({ kind: 'subtopic' as const, ...row })),
    ...classifications.map((row) => ({ kind: 'classification' as const, ...row })),
  ];
}

/**
 * Changes whenever anything the public API serves changes: an indicator is published, or a
 * topic, subtopic or classification is edited. Reference data loaded by the core data import
 * changes only with a deployment.
 */
export async function getDataVersion(db: Database): Promise<string> {
  const [row] = await db.execute<{ version: string | null }>(sql`
    SELECT concat_ws('|',
      (SELECT max(last_published_at) FROM published.indicator),
      (SELECT max(updated_at) FROM published.topic),
      (SELECT max(updated_at) FROM published.subtopic),
      (SELECT max(updated_at) FROM published.classification)
    ) AS version
  `);

  return row?.version ?? '';
}
