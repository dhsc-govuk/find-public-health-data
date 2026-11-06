import type postgres from 'postgres';
import { copyInto } from './data-migration-copy.ts';
import { validateMigrationHeader } from './data-migration-header.ts';
import { type LegacySourceMap, mapLegacySources } from './legacy-sources.ts';

/**
 * Resolves legacy numerator/denominator source references to core provider/source pairs and
 * inserts rows into indicator_version_source. Requires migration_source_indicator_version (with
 * numerator_source_id and denominator_source_id columns) to be alive in the transaction, as
 * applyIndicatorVersionRows leaves it.
 */
export async function applyLegacySources(
  tx: postgres.TransactionSql,
  directory: string,
  legacySourceMap: LegacySourceMap,
): Promise<void> {
  await tx.unsafe(
    `CREATE TEMP TABLE migration_numerator_denominator_source (id uuid PRIMARY KEY, name text NOT NULL, url text) ON COMMIT DROP`,
  );
  const file = `${directory}/numerator_denominator_source.csv.gz`;
  const { columns } = await validateMigrationHeader(
    tx,
    'migration_numerator_denominator_source',
    file,
  );
  await copyInto(
    tx,
    'migration_numerator_denominator_source',
    columns,
    file,
    'loading legacy sources',
    { table: 'indicator_version_source', phase: 'upsert' },
    () => {},
  );

  const used = await tx<{ id: string; name: string }[]>`
    SELECT s.id, s.name FROM migration_numerator_denominator_source s
    WHERE s.id IN (
      SELECT numerator_source_id FROM migration_source_indicator_version
      UNION SELECT denominator_source_id FROM migration_source_indicator_version
    )
  `;
  const [dangling] = await tx<{ count: number }[]>`
    SELECT count(*)::int AS count FROM migration_source_indicator_version v
    CROSS JOIN LATERAL (VALUES (v.numerator_source_id), (v.denominator_source_id)) AS p (id)
    WHERE p.id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM migration_numerator_denominator_source s WHERE s.id = p.id)
  `;
  if (dangling?.count) {
    throw new Error(`${dangling.count} migrated sources name a row the source list does not hold`);
  }

  const pairs = await mapLegacySources(tx, used, legacySourceMap);

  await tx.unsafe(
    `CREATE TEMP TABLE migration_source_pair_map (legacy_id uuid, position smallint, provider_id uuid, source_id uuid) ON COMMIT DROP`,
  );
  if (pairs.length > 0) {
    await tx`INSERT INTO migration_source_pair_map ${tx(
      pairs.map(({ legacyId, position, providerId, sourceId }) => ({
        legacy_id: legacyId,
        position,
        provider_id: providerId,
        source_id: sourceId,
      })),
    )}`;
  }

  await tx`
    DELETE FROM indicator_version_source
    WHERE indicator_version_id IN (SELECT id FROM migration_source_indicator_version)
  `;
  await tx`
    INSERT INTO indicator_version_source
      (indicator_version_id, part, position, provider_id, source_id)
    SELECT v.id, p.part, m.position, m.provider_id, m.source_id
    FROM migration_source_indicator_version v
    CROSS JOIN LATERAL (
      VALUES ('numerator', v.numerator_source_id), ('denominator', v.denominator_source_id)
    ) AS p (part, legacy_id)
    JOIN migration_source_pair_map m ON m.legacy_id = p.legacy_id
  `;
}
