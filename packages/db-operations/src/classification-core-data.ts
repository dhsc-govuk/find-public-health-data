import { z } from '@fphd/config';
import { type Database, schema } from '@fphd/db';
import { sql } from 'drizzle-orm';

import { findDuplicates } from './parse-topics-file.ts';
import { summarizeUpsert, type UpsertSummary } from './topic-import.ts';

const { classification, classificationRecordSchema } = schema;

const classificationsFileSchema = z.array(classificationRecordSchema);

/**
 * Parses the classifications file, refusing a repeated id or slug, which the upsert would
 * mishandle, or a name repeated within a dimension, which a publisher could not tell apart.
 */
export function parseClassificationsFile(data: unknown): schema.ClassificationRecord[] {
  const result = classificationsFileSchema.safeParse(data);

  if (!result.success) {
    throw new Error(`Invalid classifications file:\n${z.prettifyError(result.error)}`);
  }

  const records = result.data;
  const problems = [
    ...findDuplicates(records.map(({ id }) => id)).map((id) => `duplicate id: ${id}`),
    ...findDuplicates(records.map(({ slug }) => slug)).map((slug) => `duplicate slug: ${slug}`),
    ...findDuplicates(records.map(({ dimension, name }) => `${dimension}: ${name}`)).map(
      (name) => `duplicate name: ${name}`,
    ),
  ];

  if (problems.length > 0) {
    throw new Error(`Invalid classifications file:\n${problems.join('\n')}`);
  }

  return records;
}

export interface ClassificationUpsertResult {
  summary: UpsertSummary;
  /** Rows in the database but not the file: reported, never deleted, as indicators may use them. */
  orphaned: { id: string; slug: string }[];
}

/** Upserts the classifications, matched on id, rewriting a row only when the file disagrees. */
export async function upsertClassifications(
  db: Database,
  records: schema.ClassificationRecord[],
): Promise<ClassificationUpsertResult> {
  const ids = new Set(records.map(({ id }) => id));
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: classification.id, slug: classification.slug })
      .from(classification);
    const outcomes = records.length
      ? await tx
          .insert(classification)
          .values(records)
          .onConflictDoUpdate({
            target: classification.id,
            set: {
              dimension: sql`excluded.dimension`,
              slug: sql`excluded.slug`,
              name: sql`excluded.name`,
              updatedAt: sql`now()`,
            },
            setWhere: sql`(${classification.dimension}, ${classification.slug}, ${classification.name}) IS DISTINCT FROM (excluded.dimension, excluded.slug, excluded.name)`,
          })
          .returning({ id: classification.id, wasInsert: sql<boolean>`xmax = 0` })
      : [];

    return {
      summary: summarizeUpsert(records.length, outcomes),
      orphaned: existing.filter((row) => !ids.has(row.id)),
    };
  });
}
