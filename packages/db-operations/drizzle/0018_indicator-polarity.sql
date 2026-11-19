-- A version holds its polarity as one of the service's four values rather than a reference to
-- the Fingertips lookup rows, which are translated here once and then dropped.
ALTER TABLE "indicator_version" ADD COLUMN "polarity" text;--> statement-breakpoint
UPDATE "indicator_version" v
SET "polarity" = CASE p.name
  WHEN 'RAG - High is good' THEN 'higher-is-better'
  WHEN 'RAG - Low is good' THEN 'lower-is-better'
  WHEN 'BOB - Blue orange blue' THEN 'no-polarity'
  WHEN 'Not applicable' THEN 'no-comparison-possible'
END
FROM "polarity" p
WHERE p.id = v.polarity_id;--> statement-breakpoint
-- Stops rather than drop an answer none of the four values covers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "indicator_version" WHERE "polarity_id" IS NOT NULL AND "polarity" IS NULL
  ) THEN
    RAISE EXCEPTION 'indicator_version references a polarity with no value to translate it to';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_polarity_check" CHECK ("indicator_version"."polarity" IN ('higher-is-better', 'lower-is-better', 'no-polarity', 'no-comparison-possible'));--> statement-breakpoint

-- published.indicator names polarity_id, so it is rebuilt with polarity in its place.
DROP VIEW published.indicator;--> statement-breakpoint
DROP VIEW published.polarity;--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_polarity_id_polarity_id_fk";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "polarity_id";--> statement-breakpoint
DROP TABLE "polarity";--> statement-breakpoint

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
GRANT SELECT ON published.indicator TO public_api, internal_api;
