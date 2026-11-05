import { type Database, schema } from '@fphd/db';
import { sql } from 'drizzle-orm';

const { SYSTEM_USER_IDS, topic } = schema;

export interface ExistingTopic {
  id: string;
  slug: string;
  title: string;
  description: string;
}

/** Rows present in the database but absent from the given records — reported, never deleted. */
export function findOrphanedTopics(
  records: schema.TopicRecord[],
  existingTopics: ExistingTopic[],
): ExistingTopic[] {
  const recordIds = new Set(records.map((record) => record.id));

  return existingTopics.filter((topic) => !recordIds.has(topic.id));
}

export interface UpsertOutcome {
  id: string;
  /** True for a fresh insert (`xmax = 0`), false for a row the conflict clause updated. */
  wasInsert: boolean;
}

export interface UpsertSummary {
  inserted: number;
  updated: number;
  unchanged: number;
}

/**
 * Rows the database didn't return went through the upsert's conflict branch but failed its
 * `setWhere` — i.e. an existing row whose data already matched the incoming record, left
 * untouched.
 */
export function summarizeUpsert(recordCount: number, outcomes: UpsertOutcome[]): UpsertSummary {
  const inserted = outcomes.filter((outcome) => outcome.wasInsert).length;
  const updated = outcomes.filter((outcome) => !outcome.wasInsert).length;

  return { inserted, updated, unchanged: recordCount - inserted - updated };
}

export interface UpsertResult {
  summary: UpsertSummary;
  orphaned: ExistingTopic[];
}

/**
 * Upserts the given topics, matched on id, as the core data import. Never deletes: a database row
 * absent from the records is reported back via `orphaned`, not removed.
 */
export async function upsertTopics(
  db: Database,
  records: schema.TopicRecord[],
): Promise<UpsertResult> {
  return db.transaction(async (tx) => {
    const existingTopics = await tx
      .select({
        id: topic.id,
        slug: topic.slug,
        title: topic.title,
        description: topic.description,
      })
      .from(topic);

    const orphaned = findOrphanedTopics(records, existingTopics);

    const outcomes = records.length
      ? await tx
          .insert(topic)
          .values(
            records.map((record) => ({
              ...record,
              createdBy: SYSTEM_USER_IDS.coreDataImport,
              updatedBy: SYSTEM_USER_IDS.coreDataImport,
            })),
          )
          .onConflictDoUpdate({
            target: topic.id,
            set: {
              slug: sql`excluded.slug`,
              title: sql`excluded.title`,
              description: sql`excluded.description`,
              updatedAt: sql`now()`,
              updatedBy: sql`excluded.updated_by`,
            },
            // Only rewrite the row (and bump updatedAt) when the incoming record actually
            // disagrees with what's stored — otherwise a no-op re-run would still touch every
            // row's timestamp.
            setWhere: sql`${topic.slug} IS DISTINCT FROM excluded.slug OR ${topic.title} IS DISTINCT FROM excluded.title OR ${topic.description} IS DISTINCT FROM excluded.description`,
          })
          // xmax = 0 is the standard postgres upsert idiom for "this row was just inserted, not
          // updated" — a fresh tuple has never been superseded, so its xmax is unset.
          .returning({ id: topic.id, wasInsert: sql<boolean>`xmax = 0` })
      : [];

    return { summary: summarizeUpsert(records.length, outcomes), orphaned };
  });
}
