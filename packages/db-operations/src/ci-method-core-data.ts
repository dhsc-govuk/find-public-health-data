import { z } from '@fphd/config';
import { type Database, schema } from '@fphd/db';
import { CI_METHOD_KINDS } from '@fphd/utils/ci-method-kind';
import { sql } from 'drizzle-orm';

import { findDuplicates } from './parse-topics-file.ts';
import { summarizeUpsert, type UpsertSummary } from './topic-import.ts';

const { ciMethod } = schema;

/** A confidence interval method as the core data file states it, under the service's names. */
export const ciMethodRecordSchema = z.object({
  id: z.uuidv7(),
  name: z.string().min(1),
  kind: z.enum(CI_METHOD_KINDS),
  description: z.string().min(1).nullable(),
});

export type CiMethodRecord = z.infer<typeof ciMethodRecordSchema>;

const ciMethodsFileSchema = z.array(ciMethodRecordSchema);

/** Parses the CI methods file, refusing a repeated id or name, which the upsert would mishandle. */
export function parseCiMethodsFile(data: unknown): CiMethodRecord[] {
  const result = ciMethodsFileSchema.safeParse(data);

  if (!result.success) {
    throw new Error(`Invalid CI methods file:\n${z.prettifyError(result.error)}`);
  }

  const methods = result.data;
  const problems = [
    ...findDuplicates(methods.map(({ id }) => id)).map((id) => `duplicate id: ${id}`),
    ...findDuplicates(methods.map(({ name }) => name)).map((name) => `duplicate name: ${name}`),
  ];

  if (problems.length > 0) throw new Error(`Invalid CI methods file:\n${problems.join('\n')}`);

  return methods;
}

export interface CiMethodUpsertResult {
  summary: UpsertSummary;
  /** Methods in the database but not the file: reported, never deleted, as rows may reference them. */
  orphaned: { id: string; name: string }[];
}

/** Upserts the methods, matched on id, rewriting a row only when the file disagrees with it. */
export async function upsertCiMethods(
  db: Database,
  records: CiMethodRecord[],
): Promise<CiMethodUpsertResult> {
  const ids = new Set(records.map((record) => record.id));
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: ciMethod.id, name: ciMethod.name }).from(ciMethod);
    const outcomes = await tx
      .insert(ciMethod)
      .values(records)
      .onConflictDoUpdate({
        target: ciMethod.id,
        set: {
          name: sql`excluded.name`,
          kind: sql`excluded.kind`,
          description: sql`excluded.description`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`(${ciMethod.name}, ${ciMethod.kind}, ${ciMethod.description}) IS DISTINCT FROM (excluded.name, excluded.kind, excluded.description)`,
      })
      .returning({ id: ciMethod.id, wasInsert: sql<boolean>`xmax = 0` });

    return {
      summary: summarizeUpsert(records.length, outcomes),
      orphaned: existing.filter((row) => !ids.has(row.id)),
    };
  });
}
