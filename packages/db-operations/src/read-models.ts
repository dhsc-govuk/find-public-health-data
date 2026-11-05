import { createDbFromTransaction } from '@fphd/db';
import { rebuildReadModelTables as rebuildTables } from '@fphd/internal-read-models';
import type postgres from 'postgres';

/** Rebuilds the read models from the published views in one transaction, then analyzes them. */
export async function rebuildReadModels(sql: postgres.Sql): Promise<void> {
  await sql.begin((tx) => rebuildReadModelTables(tx));
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
