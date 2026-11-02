import type postgres from 'postgres';

/** The derived tables, in one place so the rebuild, the seed's truncate and the
 * operations CLI's row-count report cannot disagree about what a read model is. */
export const READ_MODEL_TABLES = ['available_data', 'observation_range'] as const;

/**
 * Rebuild the derived read-model tables from the published views, atomically, so they hold
 * only what the public site may show. Dimension rows are reached only through
 * published.observation: published.observation_dimension would join the observations again.
 */
export async function rebuildReadModels(sql: postgres.Sql): Promise<void> {
  await sql.begin((tx) => rebuildReadModelTables(tx));
  await analyzeReadModels(sql);
}

/** The transaction-aware body, so a caller can commit a seed and this rebuild as one. */
export async function rebuildReadModelTables(tx: postgres.TransactionSql): Promise<void> {
  // DELETE rather than TRUNCATE: it takes only row locks, so readers keep seeing
  // the previous read models until the rebuild commits.
  await tx`DELETE FROM available_data`;
  await tx`DELETE FROM observation_range`;

  await tx`
      INSERT INTO available_data (indicator_id, area_type_id, area_type_name, area_count)
      SELECT o.indicator_id, a.area_type_id, MAX(at.name), COUNT(DISTINCT o.area_id)
      FROM published.observation o
      JOIN published.area a ON a.id = o.area_id
      JOIN published.area_type at ON at.id = a.area_type_id
      GROUP BY o.indicator_id, a.area_type_id
    `;

  // Keep aligned with the newest migration inserting into observation_range, which reads the
  // tables; a test runs both against a seed whose data is all published.
  await tx`
      INSERT INTO observation_range
        (indicator_id, display_group, from_date, to_date, segment, min, max)
      WITH range_observations AS (
        SELECT
          o.indicator_id,
          at.display_group,
          o.from_date,
          o.to_date,
          o.value,
          coalesce(
            string_agg(dv.name, '|' ORDER BY dt.name COLLATE "C"),
            ''
          ) AS segment
        FROM published.observation o
        JOIN published.area a ON a.id = o.area_id
        JOIN published.area_type at ON at.id = a.area_type_id
        LEFT JOIN observation_dimension od ON od.observation_id = o.id
        LEFT JOIN published.dimension_type dt ON dt.id = od.dimension_type_id
        LEFT JOIN published.dimension_value dv ON dv.id = od.dimension_value_id
        WHERE o.value IS NOT NULL
          AND at.display_group IS NOT NULL
        GROUP BY o.id, o.indicator_id, at.display_group, o.from_date, o.to_date, o.value
      )
      SELECT
        ro.indicator_id,
        ro.display_group,
        ro.from_date,
        ro.to_date,
        ro.segment,
        min(ro.value),
        max(ro.value)
      FROM range_observations ro
      GROUP BY ro.indicator_id, ro.display_group, ro.from_date, ro.to_date, ro.segment
    `;
}

export async function analyzeReadModels(sql: postgres.Sql): Promise<void> {
  await sql`ANALYZE available_data`;
  await sql`ANALYZE observation_range`;
}
