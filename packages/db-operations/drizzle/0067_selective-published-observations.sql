-- Keep the small publication lookup together so observation filters can use
-- the indicator/area indexes without scanning every published batch.
CREATE OR REPLACE VIEW published.observation AS
WITH published_batches AS MATERIALIZED (
  SELECT cpv.indicator_id, v.upload_batch_id
  FROM current_published_version cpv
  JOIN indicator_version v ON v.id = cpv.id
)
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
JOIN published_batches pb
  ON pb.indicator_id = o.indicator_id AND pb.upload_batch_id = o.upload_batch_id
WHERE o.deleted_at IS NULL;
