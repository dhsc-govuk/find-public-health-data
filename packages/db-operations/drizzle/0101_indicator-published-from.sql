ALTER TABLE "indicator_version" ADD COLUMN "published_from" date;
--> statement-breakpoint
-- Scalar lookups cache publication metadata without blocking predicate pushdown.
-- An explicit no-cutoff branch preserves cheap bridge join plans for unbounded batches.
CREATE OR REPLACE VIEW published.observation AS
SELECT
  o.id,
  o.indicator_id,
  o.area_id,
  o.from_date,
  o.to_date,
  o.value,
  o.count,
  o.denominator,
  o.denominator_2,
  o.lower_ci_95,
  o.upper_ci_95,
  o.lower_ci_998,
  o.upper_ci_998,
  o.created_at,
  o.numerator,
  o.dimension_key
FROM observation o
WHERE o.from_date >= ((
  SELECT jsonb_object_agg(v.upload_batch_id, COALESCE(v.published_from, '-infinity'::date))
  FROM current_published_version cpv
  JOIN indicator_version v ON v.id = cpv.id
  WHERE v.upload_batch_id IS NOT NULL
) ->> o.upload_batch_id::text)::date;
--> statement-breakpoint
CREATE OR REPLACE VIEW published.observation_dimension AS
SELECT od.observation_id, od.dimension_value_id, od.dimension_type_id
FROM observation_dimension od
WHERE EXISTS (
  SELECT 1 FROM observation o
  WHERE o.id = od.observation_id
    AND o.upload_batch_id = ANY (ARRAY(
      SELECT v.upload_batch_id
      FROM current_published_version cpv
      JOIN indicator_version v ON v.id = cpv.id
    ))
    AND (
      NOT (COALESCE((
        SELECT jsonb_object_agg(v.upload_batch_id, v.published_from)
        FROM current_published_version cpv
        JOIN indicator_version v ON v.id = cpv.id
        WHERE v.published_from IS NOT NULL AND v.upload_batch_id IS NOT NULL
      ), '{}'::jsonb) ? o.upload_batch_id::text)
      OR o.from_date >= ((
        SELECT jsonb_object_agg(v.upload_batch_id, v.published_from)
        FROM current_published_version cpv
        JOIN indicator_version v ON v.id = cpv.id
        WHERE v.published_from IS NOT NULL AND v.upload_batch_id IS NOT NULL
      ) ->> o.upload_batch_id::text)::date
    )
);
--> statement-breakpoint
CREATE OR REPLACE VIEW published.observation_note AS
SELECT onote.observation_id, onote.note_type_id
FROM observation_note onote
WHERE EXISTS (
  SELECT 1 FROM observation o
  WHERE o.id = onote.observation_id
    AND o.upload_batch_id = ANY (ARRAY(
      SELECT v.upload_batch_id
      FROM current_published_version cpv
      JOIN indicator_version v ON v.id = cpv.id
    ))
    AND (
      NOT (COALESCE((
        SELECT jsonb_object_agg(v.upload_batch_id, v.published_from)
        FROM current_published_version cpv
        JOIN indicator_version v ON v.id = cpv.id
        WHERE v.published_from IS NOT NULL AND v.upload_batch_id IS NOT NULL
      ), '{}'::jsonb) ? o.upload_batch_id::text)
      OR o.from_date >= ((
        SELECT jsonb_object_agg(v.upload_batch_id, v.published_from)
        FROM current_published_version cpv
        JOIN indicator_version v ON v.id = cpv.id
        WHERE v.published_from IS NOT NULL AND v.upload_batch_id IS NOT NULL
      ) ->> o.upload_batch_id::text)::date
    )
);
