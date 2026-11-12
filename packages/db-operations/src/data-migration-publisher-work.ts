import { schema } from '@fphd/db';
import type postgres from 'postgres';

import { MIGRATION_USER_ID } from './data-migration-actors.ts';
import { quoteIdentifiers } from './data-migration-copy.ts';
import { dataMigrationKey } from './data-migration-manifest.ts';

const { UNPUBLISHED_STATUS_LITERALS } = schema;

const observationOwner = `
  JOIN observation o ON o.id = rows.observation_id
  JOIN upload_batch b ON b.id = o.upload_batch_id
  JOIN protected_versions owner ON owner.id = b.indicator_version_id
`;
const OWNER_JOINS: Record<string, string> = {
  indicator: 'JOIN protected_indicators owner ON owner.indicator_id = rows.id',
  upload_batch: 'JOIN protected_versions owner ON owner.id = rows.indicator_version_id',
  observation: `
    JOIN upload_batch b ON b.id = rows.upload_batch_id
    JOIN protected_versions owner ON owner.id = b.indicator_version_id
  `,
  observation_dimension: observationOwner,
  observation_note: observationOwner,
};

export async function assertMigrationPublisherRowsUnchanged(
  tx: postgres.TransactionSql,
  table: string,
  stage: string,
  phase: 'upsert' | 'delete',
): Promise<void> {
  const joins = OWNER_JOINS[table];
  if (joins === undefined) return;
  const [publisher] = await tx<{ present: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM indicator_version
      WHERE status IN (${tx.unsafe(UNPUBLISHED_STATUS_LITERALS)})
        OR created_by IS DISTINCT FROM ${MIGRATION_USER_ID}
        OR updated_by IS DISTINCT FROM ${MIGRATION_USER_ID}
    ) AS present
  `;
  if (!publisher?.present) return;

  // An upsert stage still holds the package's dimension and note type ids, so its bridge rows may
  // not match the table's here. Nothing is missed: a bridge row's owner is found through its
  // observation, which the staged row itself names.
  const matched = dataMigrationKey(table)
    .map((column) => `staged.${quoteIdentifiers([column])} = rows.${quoteIdentifiers([column])}`)
    .join(' AND ');
  const existing = `
    SELECT i.short_id AS "shortId" FROM ${quoteIdentifiers([table])} rows
    JOIN ${quoteIdentifiers([stage])} staged ON ${matched}
    ${joins}
    JOIN indicator i ON i.id = owner.indicator_id
  `;
  const touched =
    phase === 'upsert'
      ? `SELECT i.short_id AS "shortId" FROM ${quoteIdentifiers([stage])} rows ${joins}
          JOIN indicator i ON i.id = owner.indicator_id UNION ${existing}`
      : existing;
  const conflicts = await tx.unsafe<{ shortId: number }[]>(`
    WITH protected_indicators AS (
      SELECT DISTINCT v.indicator_id FROM indicator_version v
      WHERE v.status IN (${UNPUBLISHED_STATUS_LITERALS}) OR (
        v.id IN (SELECT id FROM current_published_version)
        AND (v.created_by IS DISTINCT FROM '${MIGRATION_USER_ID}'
          OR v.updated_by IS DISTINCT FROM '${MIGRATION_USER_ID}')
      )
    ), protected_versions AS (
      SELECT v.id, v.indicator_id FROM indicator_version v
      WHERE v.created_by IS DISTINCT FROM '${MIGRATION_USER_ID}'
        OR v.updated_by IS DISTINCT FROM '${MIGRATION_USER_ID}'
        OR v.indicator_id IN (SELECT indicator_id FROM protected_indicators)
    )
    SELECT DISTINCT "shortId" FROM (${touched}) conflicts ORDER BY "shortId"
  `);
  if (conflicts.length > 0) {
    throw new Error(
      `Data migration ${table} ${phase} conflicts with FPHD publisher work on indicators: ${conflicts.map(({ shortId }) => shortId).join(', ')}`,
    );
  }
}
