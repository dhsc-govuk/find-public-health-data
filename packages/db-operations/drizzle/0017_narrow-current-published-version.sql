-- current_published_version names the version and nothing else, so a new indicator_version
-- column no longer changes its definition. Narrowing it drops it, which takes the three
-- published views built on it and every grant on the four; they are recreated below reading
-- the version's columns from indicator_version, with the same columns as before.
DROP VIEW published.indicator;--> statement-breakpoint
DROP VIEW published.indicator_topic;--> statement-breakpoint
DROP VIEW published.indicator_classification;--> statement-breakpoint
DROP VIEW "public"."current_published_version";--> statement-breakpoint
CREATE VIEW "public"."current_published_version" AS (select distinct on ("indicator_version"."indicator_id") "id", "indicator_id" from "indicator_version" where "indicator_version"."status" = 'published' order by "indicator_version"."indicator_id" asc, "indicator_version"."published_at" desc, "indicator_version"."id" desc);--> statement-breakpoint

CREATE VIEW published.indicator AS
SELECT
  i.id,
  i.short_id,
  i.data_updated_at,
  i.created_at,
  v.name,
  v.slug,
  v.value_type_id,
  v.unit_id,
  v.year_type_id,
  v.ci_method_id,
  v.polarity_id,
  v.frequency_id,
  v.comparator_method_id,
  v.disclosure_threshold,
  v.ci_confidence_level,
  v.config,
  v.definition,
  v.rationale,
  v.methodology,
  v.numerator_definition,
  v.denominator_definition,
  v.disclosure_control,
  v.caveats,
  v.notes,
  v.data_source_id,
  v.numerator_source_id,
  v.denominator_source_id,
  v.updated_at,
  p.first_published_at,
  p.last_published_at
FROM indicator i
JOIN current_published_version cpv ON cpv.indicator_id = i.id
JOIN indicator_version v ON v.id = cpv.id
CROSS JOIN LATERAL (
  SELECT min(pv.published_at) AS first_published_at, max(pv.published_at) AS last_published_at
  FROM indicator_version pv
  WHERE pv.indicator_id = i.id
) p;--> statement-breakpoint

-- Memberships follow the same version published.indicator shows, so a superseded
-- version's topics never reach the public pages.
CREATE VIEW published.indicator_topic AS
SELECT cpv.indicator_id, it.topic_id
FROM current_published_version cpv
JOIN indicator_topic it ON it.indicator_version_id = cpv.id;--> statement-breakpoint

CREATE VIEW published.indicator_classification AS
SELECT cpv.indicator_id, ic.classification_id
FROM current_published_version cpv
JOIN indicator_classification ic ON ic.indicator_version_id = cpv.id;--> statement-breakpoint

-- The internal reads join current_published_version; public_api reads the published views alone.
GRANT SELECT ON current_published_version TO internal_api;--> statement-breakpoint
GRANT SELECT ON published.indicator, published.indicator_topic, published.indicator_classification
TO public_api, internal_api;
