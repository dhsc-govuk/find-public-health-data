-- A version holds how often it is updated as one of the service's values rather than a
-- reference to the Fingertips lookup rows, which are translated here once and then dropped.
ALTER TABLE "indicator_version" ADD COLUMN "update_frequency" text;--> statement-breakpoint
UPDATE "indicator_version" v
SET "update_frequency" = CASE f.name
  WHEN 'Annual' THEN 'annually'
  WHEN 'Monthly (not yet in use)' THEN 'monthly'
  WHEN 'Quarterly (not yet in use)' THEN 'quarterly'
END
FROM "frequency" f
WHERE f.id = v.frequency_id;--> statement-breakpoint
-- Stops rather than drop an answer none of the values covers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "indicator_version" WHERE "frequency_id" IS NOT NULL AND "update_frequency" IS NULL
  ) THEN
    RAISE EXCEPTION 'indicator_version references a frequency with no value to translate it to';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_update_frequency_check" CHECK ("indicator_version"."update_frequency" IN ('monthly', 'quarterly', 'annually', 'every-2-years', 'no-fixed-frequency', 'no-longer-updated'));--> statement-breakpoint

-- published.indicator names frequency_id, so it is rebuilt with update_frequency in its place.
DROP VIEW published.indicator;--> statement-breakpoint
DROP VIEW published.frequency;--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_frequency_id_frequency_id_fk";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "frequency_id";--> statement-breakpoint
DROP TABLE "frequency";--> statement-breakpoint

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
  v.polarity,
  v.update_frequency,
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
GRANT SELECT ON published.indicator TO public_api, internal_api;
