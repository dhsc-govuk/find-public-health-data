import { createDbFromTransaction, schema } from '@fphd/db';
import {
  type ReadModelTiming,
  rebuildReadModelTables as rebuildTables,
  refreshIndicatorReadModels,
} from '@fphd/internal-read-models';
import type postgres from 'postgres';

export interface ReadModelRebuildProgress {
  indicatorId: string;
  milliseconds: number;
  timings: ReadModelTiming[];
}

export async function rebuildReadModels(
  sql: postgres.Sql,
  onProgress?: (progress: ReadModelRebuildProgress) => void,
): Promise<void> {
  // Transaction facades leave the caller's timestamp parsers and JSON serializers intact;
  // wrapping its raw client directly changes subsequent data-migration queries.
  const indicators = await sql.begin(async (tx) => {
    const db = createDbFromTransaction(tx);
    // Include stale derived rows, whose indicator may no longer exist or be published.
    const ids = db
      .select({ id: schema.indicator.id })
      .from(schema.indicator)
      .union(db.select({ id: schema.availableData.indicatorId }).from(schema.availableData))
      .union(db.select({ id: schema.observationRange.indicatorId }).from(schema.observationRange))
      .union(db.select({ id: schema.observationSeries.indicatorId }).from(schema.observationSeries))
      .union(
        db
          .select({ id: schema.observationSeriesBatch.indicatorId })
          .from(schema.observationSeriesBatch),
      )
      .as('rebuild_indicators');
    return db.select().from(ids).orderBy(ids.id);
  });
  try {
    for (const { id: indicatorId } of indicators) {
      const timings: ReadModelTiming[] = [];
      const started = performance.now();
      await sql.begin((tx) =>
        refreshIndicatorReadModels(createDbFromTransaction(tx), indicatorId, (timing) =>
          timings.push(timing),
        ),
      );
      onProgress?.({ indicatorId, milliseconds: performance.now() - started, timings });
    }
  } catch (error) {
    // Completed indicators remain committed after a stop. Refresh their planner statistics even
    // then, but keep the original failure if the connection also prevents ANALYZE from running.
    await analyzeReadModels(sql).catch(() => {});
    throw error;
  }
  await analyzeReadModels(sql);
}

/** The transaction-aware body, so a caller can commit a seed and this rebuild as one. */
export function rebuildReadModelTables(tx: postgres.TransactionSql): Promise<void> {
  return rebuildTables(createDbFromTransaction(tx));
}

export async function analyzeReadModels(sql: postgres.Sql): Promise<void> {
  await sql`ANALYZE available_data`;
  await sql`ANALYZE observation_range`;
  await sql`ANALYZE observation_series`;
  await sql`ANALYZE observation_series_batch`;
}
