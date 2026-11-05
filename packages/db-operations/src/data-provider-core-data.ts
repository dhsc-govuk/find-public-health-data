import { z } from '@fphd/config';
import { type Database, schema } from '@fphd/db';
import { sql } from 'drizzle-orm';

import { findDuplicates } from './parse-topics-file.ts';
import { summarizeUpsert, type UpsertSummary } from './topic-import.ts';

const { dataProvider, dataProviderSource } = schema;

const namedRecordSchema = z.object({ id: z.uuidv7(), name: z.string().trim().min(1) });

/** A data provider as the core data file states it, with the sources it offers. */
export const dataProviderRecordSchema = namedRecordSchema.extend({
  sources: z.array(namedRecordSchema),
});

export type DataProviderRecord = z.infer<typeof dataProviderRecordSchema>;

const dataProvidersFileSchema = z.array(dataProviderRecordSchema);

/**
 * Parses the data providers file, refusing a repeated id anywhere, a repeated provider name,
 * or a source named twice under one provider, any of which the upsert would mishandle.
 */
export function parseDataProvidersFile(data: unknown): DataProviderRecord[] {
  const result = dataProvidersFileSchema.safeParse(data);

  if (!result.success) {
    throw new Error(`Invalid data providers file:\n${z.prettifyError(result.error)}`);
  }

  const providers = result.data;
  const ids = providers.flatMap(({ id, sources }) => [id, ...sources.map((source) => source.id)]);
  const problems = [
    ...findDuplicates(ids).map((id) => `duplicate id: ${id}`),
    ...findDuplicates(providers.map(({ name }) => name)).map((name) => `duplicate name: ${name}`),
    ...providers.flatMap(({ name, sources }) =>
      findDuplicates(sources.map((source) => source.name)).map(
        (source) => `duplicate source of ${name}: ${source}`,
      ),
    ),
  ];

  if (problems.length > 0) throw new Error(`Invalid data providers file:\n${problems.join('\n')}`);

  return providers;
}

export interface DataProviderUpsertResult {
  providers: UpsertSummary;
  sources: UpsertSummary;
  /** Rows in the database but not the file: reported, never deleted, as versions may name them. */
  orphaned: { id: string; name: string }[];
}

/** Upserts the providers and then their sources, matched on id, rewriting only what differs. */
export async function upsertDataProviders(
  db: Database,
  records: DataProviderRecord[],
): Promise<DataProviderUpsertResult> {
  const sources = records.flatMap(({ id: providerId, sources }) =>
    sources.map(({ id, name }) => ({ id, providerId, name })),
  );
  const ids = new Set([...records.map(({ id }) => id), ...sources.map(({ id }) => id)]);
  return db.transaction(async (tx) => {
    const existing = [
      ...(await tx.select({ id: dataProvider.id, name: dataProvider.name }).from(dataProvider)),
      ...(await tx
        .select({ id: dataProviderSource.id, name: dataProviderSource.name })
        .from(dataProviderSource)),
    ];

    const providerOutcomes =
      records.length === 0
        ? []
        : await tx
            .insert(dataProvider)
            .values(records.map(({ id, name }) => ({ id, name })))
            .onConflictDoUpdate({
              target: dataProvider.id,
              set: { name: sql`excluded.name`, updatedAt: sql`now()` },
              setWhere: sql`${dataProvider.name} IS DISTINCT FROM excluded.name`,
            })
            .returning({ id: dataProvider.id, wasInsert: sql<boolean>`xmax = 0` });
    const sourceOutcomes =
      sources.length === 0
        ? []
        : await tx
            .insert(dataProviderSource)
            .values(sources)
            .onConflictDoUpdate({
              target: dataProviderSource.id,
              set: {
                providerId: sql`excluded.provider_id`,
                name: sql`excluded.name`,
                updatedAt: sql`now()`,
              },
              setWhere: sql`(${dataProviderSource.providerId}, ${dataProviderSource.name}) IS DISTINCT FROM (excluded.provider_id, excluded.name)`,
            })
            .returning({
              id: dataProviderSource.id,
              wasInsert: sql<boolean>`xmax = 0`,
            });

    return {
      providers: summarizeUpsert(records.length, providerOutcomes),
      sources: summarizeUpsert(sources.length, sourceOutcomes),
      orphaned: existing.filter((row) => !ids.has(row.id)),
    };
  });
}
