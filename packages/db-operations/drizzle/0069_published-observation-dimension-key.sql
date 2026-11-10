-- The public API joins each row to its benchmark's row for the same breakdown by dimension_key,
-- so the view gains it. It comes last, because CREATE OR REPLACE VIEW can only add columns.
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
  o.distribution_rank,
  o.created_at,
  o.numerator,
  o.dimension_key
FROM observation o
WHERE o.deleted_at IS NULL
  AND o.upload_batch_id = ANY (ARRAY(
    SELECT v.upload_batch_id
    FROM current_published_version cpv
    JOIN indicator_version v ON v.id = cpv.id
  ));
