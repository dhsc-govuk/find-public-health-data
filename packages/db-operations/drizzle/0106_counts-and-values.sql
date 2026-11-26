-- The published indicator view selects the unit columns and the unit view the unit table, so both
-- go first. The indicator view is recreated at the end without them.
DROP VIEW published.indicator;--> statement-breakpoint
DROP VIEW published.unit;--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_unit_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_standard_population_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_unit_id_unit_id_fk";--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "has_count" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "count_measure" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "count_measure_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "count_is_estimate" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "rate_per" integer;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "rate_object" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "rate_object_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "value_same_as_count" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "value_measure" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "value_measure_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "gap_object" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "gap_object_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "ratio_format" text;--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "unit_id";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "unit_detail";--> statement-breakpoint
DROP TABLE "unit";--> statement-breakpoint
-- The service has no Excess risk or Percentage point value type. Every environment is wiped
-- in this release before it is reimported, so no version names either.
DELETE FROM "value_type"
WHERE "id" IN ('01a0d8a5-3ca2-7315-bfca-96ca4c9608e9', '01a0d8a5-3ca2-7315-bfca-96d1b508d83f');--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_count_measure_check" CHECK ("indicator_version"."count_measure" IN ('pounds', 'admissions', 'adults', 'births', 'cases', 'casualties', 'children', 'days', 'deaths', 'diagnoses', 'households', 'incidences', 'minutes', 'organisations', 'people', 'percentage-points', 'person-years', 'tests', 'vaccinations', 'years', 'other'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_count_measure_detail_check" CHECK (("indicator_version"."count_measure" IS NOT DISTINCT FROM 'other') = ("indicator_version"."count_measure_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_rate_per_check" CHECK ("indicator_version"."rate_per" IN (1, 10, 100, 1000, 10000, 100000, 1000000, 1000000000));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_rate_object_check" CHECK ("indicator_version"."rate_object" IN ('bed-days', 'capita', 'days', 'expected-deaths', 'expected-incidences', 'people', 'person-years', 'smokers-aged-16-plus', 'smokers-aged-18-plus', 're-offender', 'star-pu', 'vehicle-miles', 'other'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_rate_object_detail_check" CHECK (("indicator_version"."rate_object" IS NOT DISTINCT FROM 'other') = ("indicator_version"."rate_object_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_value_measure_check" CHECK ("indicator_version"."value_measure" IN ('pounds', 'admissions', 'adults', 'births', 'cases', 'casualties', 'children', 'days', 'deaths', 'diagnoses', 'households', 'incidences', 'minutes', 'organisations', 'people', 'percentage-points', 'person-years', 'tests', 'vaccinations', 'years', 'other'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_value_measure_detail_check" CHECK (("indicator_version"."value_measure" IS NOT DISTINCT FROM 'other') = ("indicator_version"."value_measure_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_gap_object_check" CHECK ("indicator_version"."gap_object" IN ('employment-rates', 'life-expectancies', 'other'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_gap_object_detail_check" CHECK (("indicator_version"."gap_object" IS NOT DISTINCT FROM 'other') = ("indicator_version"."gap_object_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_ratio_format_check" CHECK ("indicator_version"."ratio_format" IN ('number', 'percentage'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_standard_population_detail_check" CHECK ("indicator_version"."standard_population_detail" IS NULL OR "indicator_version"."standard_population" IS NOT DISTINCT FROM 'other' OR "indicator_version"."value_type_id" IN ('01a0d8a5-3ca2-7315-bfca-96cc2dc711c3', '01a217b8-441c-7078-8e42-15fa9781174a', '01a0d8a5-3ca2-7315-bfca-96cda63ea940'));--> statement-breakpoint
CREATE VIEW published.indicator AS
SELECT
  i.id,
  i.short_id,
  i.data_updated_at,
  i.created_at,
  v.name,
  v.slug,
  v.value_type_id,
  v.has_count,
  v.count_measure,
  v.count_measure_detail,
  v.count_is_estimate,
  v.rate_per,
  v.rate_object,
  v.rate_object_detail,
  v.value_same_as_count,
  v.value_measure,
  v.value_measure_detail,
  v.gap_object,
  v.gap_object_detail,
  v.ratio_format,
  v.year_type,
  v.year_end_day,
  v.year_end_month,
  v.ci_method_id,
  v.polarity,
  v.update_frequency,
  v.update_frequency_reason,
  v.update_frequency_text,
  v.update_frequency_years,
  v.comparator_method_id,
  v.has_goal_benchmark,
  v.ci_confidence_level,
  v.definition,
  v.rationale,
  v.methodology,
  v.numerator_definition,
  v.numerator_disclosure_control_detail,
  v.denominator_definition,
  v.denominator_disclosure_control_detail,
  v.caveats_detail,
  v.other_notes_detail,
  v.data_source_id,
  v.updated_at,
  p.first_published_at,
  p.last_published_at,
  v.fingertips_formatting
FROM indicator i
JOIN current_published_version cpv ON cpv.indicator_id = i.id
JOIN indicator_version v ON v.id = cpv.id
CROSS JOIN LATERAL (
  SELECT min(pv.published_at) AS first_published_at, max(pv.published_at) AS last_published_at
  FROM indicator_version pv
  WHERE pv.indicator_id = i.id
) p;--> statement-breakpoint
GRANT SELECT ON published.indicator TO public_api, internal_api;
