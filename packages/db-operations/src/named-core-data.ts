import { z } from '@fphd/config';
import { type Database, schema } from '@fphd/db';
import { sql } from 'drizzle-orm';

import { findDuplicates } from './parse-topics-file.ts';
import { summarizeUpsert, type UpsertSummary } from './topic-import.ts';

const { comparatorMethod } = schema;

/** An entry of a list a publisher chooses from, as its core data file states it. */
export const namedRecordSchema = z.object({ id: z.uuidv7(), name: z.string().trim().min(1) });

export type NamedRecord = z.infer<typeof namedRecordSchema>;

const namedRecordsFileSchema = z.array(namedRecordSchema);

/** Parses a list's file, refusing a repeated id or name, which the upsert would mishandle. */
export function parseNamedRecordsFile(list: string, data: unknown): NamedRecord[] {
  const result = namedRecordsFileSchema.safeParse(data);

  if (!result.success) {
    throw new Error(`Invalid ${list} file:\n${z.prettifyError(result.error)}`);
  }

  const records = result.data;
  const problems = [
    ...findDuplicates(records.map(({ id }) => id)).map((id) => `duplicate id: ${id}`),
    ...findDuplicates(records.map(({ name }) => name)).map((name) => `duplicate name: ${name}`),
  ];

  if (problems.length > 0) throw new Error(`Invalid ${list} file:\n${problems.join('\n')}`);

  return records;
}

export interface NamedUpsertResult {
  summary: UpsertSummary;
  /** Rows in the database but not the file: reported, never deleted, as versions may name them. */
  orphaned: { id: string; name: string }[];
}

/**
 * Upserts the value types or units, matched on id, each at its place in the file, which is
 * the order the publisher's form lists them in. A row is rewritten only when the file disagrees.
 */
export async function upsertOrderedNames(
  db: Database,
  table: typeof schema.valueType | typeof schema.unit,
  records: NamedRecord[],
): Promise<NamedUpsertResult> {
  const ids = new Set(records.map(({ id }) => id));
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: table.id, name: table.name }).from(table);
    const outcomes =
      records.length === 0
        ? []
        : await tx
            .insert(table)
            .values(records.map((record, position) => ({ ...record, position })))
            .onConflictDoUpdate({
              target: table.id,
              set: {
                name: sql`excluded.name`,
                position: sql`excluded.position`,
                updatedAt: sql`now()`,
              },
              setWhere: sql`(${table.name}, ${table.position}) IS DISTINCT FROM (excluded.name, excluded.position)`,
            })
            .returning({ id: table.id, wasInsert: sql<boolean>`xmax = 0` });

    return {
      summary: summarizeUpsert(records.length, outcomes),
      orphaned: existing.filter((row) => !ids.has(row.id)),
    };
  });
}

/** Upserts the comparator methods, matched on id, rewriting a row only when its name differs. */
export async function upsertComparatorMethods(
  db: Database,
  records: NamedRecord[],
): Promise<NamedUpsertResult> {
  const ids = new Set(records.map(({ id }) => id));
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: comparatorMethod.id, name: comparatorMethod.name })
      .from(comparatorMethod);
    const outcomes =
      records.length === 0
        ? []
        : await tx
            .insert(comparatorMethod)
            .values(records)
            .onConflictDoUpdate({
              target: comparatorMethod.id,
              set: { name: sql`excluded.name`, updatedAt: sql`now()` },
              setWhere: sql`${comparatorMethod.name} IS DISTINCT FROM excluded.name`,
            })
            .returning({
              id: comparatorMethod.id,
              wasInsert: sql<boolean>`xmax = 0`,
            });

    return {
      summary: summarizeUpsert(records.length, outcomes),
      orphaned: existing.filter((row) => !ids.has(row.id)),
    };
  });
}
