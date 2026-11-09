-- Bulk reads use the area/indicator indexes. Bridge lookups gather published
-- batch ids once so each matched observation needs only its primary-key read.
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
  AND o.upload_batch_id IN (
    SELECT v.upload_batch_id
    FROM current_published_version cpv
    JOIN indicator_version v ON v.id = cpv.id
  );--> statement-breakpoint

CREATE OR REPLACE VIEW published.observation_note AS
SELECT onote.id, onote.observation_id, onote.note_type_id
FROM observation_note onote
WHERE EXISTS (
 SELECT 1 FROM observation o
 WHERE o.id = onote.observation_id
 AND o.deleted_at IS NULL
 AND o.upload_batch_id = ANY (ARRAY(
  SELECT v.upload_batch_id FROM current_published_version cpv
  JOIN indicator_version v ON v.id = cpv.id
 ))
);--> statement-breakpoint

CREATE OR REPLACE VIEW published.observation_dimension AS
SELECT od.id, od.observation_id, od.dimension_value_id, od.dimension_type_id
FROM observation_dimension od
WHERE EXISTS (
 SELECT 1 FROM observation o
 WHERE o.id = od.observation_id
 AND o.deleted_at IS NULL
 AND o.upload_batch_id = ANY (ARRAY(
  SELECT v.upload_batch_id FROM current_published_version cpv
  JOIN indicator_version v ON v.id = cpv.id
 ))
);
