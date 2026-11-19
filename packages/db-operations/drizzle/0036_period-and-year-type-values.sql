ALTER TABLE "indicator_version" ADD COLUMN "period_type" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "year_type" text;--> statement-breakpoint
-- The ids are the rows migration 0034 inserted, which were the only ones a version could name.
UPDATE "indicator_version" SET
  "period_type" = CASE "period_type_id"
    WHEN '01a0d88c-310a-7c54-b512-a99ca789cc12' THEN 'years'
    WHEN '01a0d88c-310a-7c9d-b589-353d97eedb54' THEN 'quarters'
    WHEN '01a0d88c-310a-7ca1-9ba4-031b00f46799' THEN 'months'
  END,
  "year_type" = CASE "year_type_id"
    WHEN '01a0d88c-310a-7ca5-8494-19e32c307628' THEN 'calendar'
    WHEN '01a0d88c-310a-7ca8-9a3b-40fc6f585b8a' THEN 'financial'
    WHEN '01a0d88c-310a-7cab-8847-543e49e4c685' THEN 'academic'
    WHEN '01a0d88c-310a-7cae-ae91-2c6e6e6b707a' THEN 'rolling'
    WHEN '01a0d88c-310a-7cb1-af6e-3712b2958e12' THEN 'specified-end-date'
  END;--> statement-breakpoint
-- Stops rather than drop an answer none of the translations covers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "indicator_version"
    WHERE ("period_type_id" IS NOT NULL AND "period_type" IS NULL)
      OR ("year_type_id" IS NOT NULL AND "year_type" IS NULL)
  ) THEN
    RAISE EXCEPTION 'indicator_version references a period or year type with no value to translate it to';
  END IF;
END
$$;--> statement-breakpoint
-- published.indicator names year_type_id, so it goes before the column does.
DROP VIEW published.indicator;--> statement-breakpoint
DROP VIEW published.year_type;--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_year_type_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_year_end_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "period_type_id";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "year_type_id";--> statement-breakpoint
DROP TABLE "period_type";--> statement-breakpoint
DROP TABLE "year_type";--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_period_type_check" CHECK ("indicator_version"."period_type" IN ('years', 'quarters', 'months'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_year_type_period_check" CHECK (("indicator_version"."year_type" IS NOT NULL) = ("indicator_version"."period_type" IS NOT NULL AND "indicator_version"."period_type" IN ('years', 'quarters')));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_year_type_check" CHECK ("indicator_version"."year_type" IN ('calendar', 'financial', 'academic', 'rolling', 'specified-end-date'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_year_end_check" CHECK (("indicator_version"."year_end_day" IS NOT NULL) = ("indicator_version"."year_type" IS NOT DISTINCT FROM 'specified-end-date') AND ("indicator_version"."year_end_month" IS NOT NULL) = ("indicator_version"."year_end_day" IS NOT NULL));--> statement-breakpoint
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
  v.unit_other,
  v.year_type,
  v.year_end_day,
  v.year_end_month,
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
  v.disclosure_control_detail,
  v.caveats_detail,
  v.other_notes_detail,
  v.data_source_id,
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
