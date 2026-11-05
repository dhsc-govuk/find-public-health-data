import { z } from '@fphd/config';
import { type Database, schema } from '@fphd/db';
import { asc, sql } from 'drizzle-orm';

import { findDuplicates } from './parse-topics-file.ts';
import { summarizeUpsert, type UpsertSummary } from './topic-import.ts';

const { subtopic, subtopicRecordSchema } = schema;

export interface SubtopicUpsertResult {
  summary: UpsertSummary;
  orphaned: Pick<schema.SubtopicRecord, 'id' | 'topicId' | 'slug' | 'title'>[];
}

export function parseSubtopicsFile(data: unknown): schema.SubtopicRecord[] {
  const result = z.array(subtopicRecordSchema).safeParse(data);
  if (!result.success) throw new Error(`Invalid subtopics file:\n${z.prettifyError(result.error)}`);
  const duplicates = [
    ...findDuplicates(result.data.map(({ id }) => id)),
    ...findDuplicates(result.data.map(({ topicId, slug }) => `${topicId}:${slug}`)),
  ];
  if (duplicates.length) throw new Error(`Duplicate subtopics: ${duplicates.join(', ')}`);
  return result.data;
}

export async function upsertSubtopics(
  db: Database,
  records: schema.SubtopicRecord[],
): Promise<SubtopicUpsertResult> {
  return db.transaction(async (tx) => {
    const outcomes =
      records.length === 0
        ? []
        : await tx
            .insert(subtopic)
            .values(records)
            .onConflictDoUpdate({
              target: subtopic.id,
              set: {
                topicId: sql`excluded.topic_id`,
                slug: sql`excluded.slug`,
                title: sql`excluded.title`,
                updatedAt: sql`now()`,
              },
              setWhere: sql`(${subtopic.topicId}, ${subtopic.slug}, ${subtopic.title}) IS DISTINCT FROM (excluded.topic_id, excluded.slug, excluded.title)`,
            })
            .returning({ id: subtopic.id, wasInsert: sql<boolean>`xmax = 0` });
    const ids = new Set(records.map(({ id }) => id));
    const existing = await tx
      .select({
        id: subtopic.id,
        topicId: subtopic.topicId,
        slug: subtopic.slug,
        title: subtopic.title,
      })
      .from(subtopic)
      .orderBy(asc(subtopic.title));
    return {
      summary: summarizeUpsert(records.length, outcomes),
      orphaned: existing.filter(({ id }) => !ids.has(id)),
    };
  });
}
