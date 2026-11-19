-- The upload batch is internal detail, so the public read surface drops it. A view cannot
-- lose a column in place, so published.observation and the two views that read it are
-- recreated, and their grants with them.
DROP VIEW published.observation_note;--> statement-breakpoint
DROP VIEW published.observation_dimension;--> statement-breakpoint
DROP VIEW published.observation;--> statement-breakpoint

-- The indicator-level predicate holds whatever the data plan later does with row-level
-- publication state: an indicator with no published version exposes no observations.
CREATE VIEW published.observation AS
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
  o.published_at,
  o.created_at
FROM observation o
WHERE o.deleted_at IS NULL
  AND o.indicator_id IN (SELECT indicator_id FROM indicator_version WHERE status = 'published');--> statement-breakpoint

CREATE VIEW published.observation_dimension AS
SELECT od.id, od.observation_id, od.dimension_value_id, od.dimension_type_id
FROM observation_dimension od
WHERE EXISTS (SELECT 1 FROM published.observation o WHERE o.id = od.observation_id);--> statement-breakpoint

CREATE VIEW published.observation_note AS
SELECT onote.id, onote.observation_id, onote.note_type_id
FROM observation_note onote
WHERE EXISTS (SELECT 1 FROM published.observation o WHERE o.id = onote.observation_id);--> statement-breakpoint

GRANT SELECT ON published.observation, published.observation_dimension, published.observation_note
TO public_api, internal_api;
