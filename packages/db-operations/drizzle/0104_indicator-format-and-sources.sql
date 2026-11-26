CREATE TABLE "indicator_version_data_value" (
	"indicator_version_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"definition" text,
	"disclosure_control" text,
	"disclosure_control_detail" text,
	CONSTRAINT "indicator_version_data_value_indicator_version_id_position_pk" PRIMARY KEY("indicator_version_id","position"),
	CONSTRAINT "indicator_version_data_value_position_check" CHECK ("indicator_version_data_value"."position" >= 0),
	CONSTRAINT "indicator_version_data_value_disclosure_control_check" CHECK ("indicator_version_data_value"."disclosure_control" IN ('yes', 'not-applicable')),
	CONSTRAINT "indicator_version_data_value_disclosure_control_detail_check" CHECK (("indicator_version_data_value"."disclosure_control" IS NOT DISTINCT FROM 'yes') = ("indicator_version_data_value"."disclosure_control_detail" IS NOT NULL))
);
--> statement-breakpoint
DROP VIEW "published"."indicator";--> statement-breakpoint
ALTER TABLE "indicator_version_source" DROP CONSTRAINT "indicator_version_source_pair_unique";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_disclosure_control_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_disclosure_control_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version_source" DROP CONSTRAINT "indicator_version_source_part_check";--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" DROP CONSTRAINT "indicator_version_submission_flag_task_key_check";--> statement-breakpoint
-- The Numerator and Denominator tasks become Indicator format and sources. Reviewers' flags on
-- either task are deleted rather than moved, as the databases holding any are reset.
DELETE FROM "indicator_version_submission_flag" WHERE "task_key" IN ('numerator', 'denominator');--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "has_numerator_denominator" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "numerator_disclosure_control" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "numerator_disclosure_control_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "denominator_disclosure_control" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "denominator_disclosure_control_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version_source" ADD COLUMN "data_value_position" smallint;--> statement-breakpoint
ALTER TABLE "indicator_version_data_value" ADD CONSTRAINT "indicator_version_data_value_version_fk" FOREIGN KEY ("indicator_version_id") REFERENCES "public"."indicator_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_source" ADD CONSTRAINT "indicator_version_source_data_value_fk" FOREIGN KEY ("indicator_version_id","data_value_position") REFERENCES "public"."indicator_version_data_value"("indicator_version_id","position") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "disclosure_control";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "disclosure_control_detail";--> statement-breakpoint
ALTER TABLE "indicator_version_source" ADD CONSTRAINT "indicator_version_source_pair_unique" UNIQUE NULLS NOT DISTINCT("indicator_version_id","part","data_value_position","provider_id","source_id");--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_numerator_disclosure_control_check" CHECK ("indicator_version"."numerator_disclosure_control" IN ('yes', 'not-applicable'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_numerator_disclosure_control_detail_check" CHECK (("indicator_version"."numerator_disclosure_control" IS NOT DISTINCT FROM 'yes') = ("indicator_version"."numerator_disclosure_control_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_denominator_disclosure_control_check" CHECK ("indicator_version"."denominator_disclosure_control" IN ('yes', 'not-applicable'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_denominator_disclosure_control_detail_check" CHECK (("indicator_version"."denominator_disclosure_control" IS NOT DISTINCT FROM 'yes') = ("indicator_version"."denominator_disclosure_control_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_numerator_denominator_check" CHECK ("indicator_version"."has_numerator_denominator" IS NOT FALSE OR ("indicator_version"."numerator_definition" IS NULL AND "indicator_version"."numerator_disclosure_control" IS NULL AND "indicator_version"."denominator_definition" IS NULL AND "indicator_version"."denominator_disclosure_control" IS NULL));--> statement-breakpoint
ALTER TABLE "indicator_version_source" ADD CONSTRAINT "indicator_version_source_data_value_check" CHECK (("indicator_version_source"."part" = 'data-value') = ("indicator_version_source"."data_value_position" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version_source" ADD CONSTRAINT "indicator_version_source_part_check" CHECK ("indicator_version_source"."part" IN ('numerator', 'denominator', 'data-value'));--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" ADD CONSTRAINT "indicator_version_submission_flag_task_key_check" CHECK ("indicator_version_submission_flag"."task_key" IN ('name', 'data-table', 'definition-and-rationale', 'polarity', 'data-quality', 'format-and-sources', 'calculation', 'confidence-intervals', 'update-frequency', 'value-type-and-units', 'period-type', 'other-notes-and-caveats', 'publishing-date', 'benchmarking', 'sex-gender-and-ethnicity', 'ages', 'tagging', 'update-summary'));--> statement-breakpoint
-- A view cannot take a column in the middle of its list, so it is recreated with its grant.
CREATE VIEW "published"."indicator" AS (
SELECT
  i.id,
  i.short_id,
  i.data_updated_at,
  i.created_at,
  v.name,
  v.slug,
  v.value_type_id,
  v.unit_id,
  v.unit_detail,
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
) p
      );--> statement-breakpoint
GRANT SELECT ON published.indicator TO public_api, internal_api;--> statement-breakpoint
-- A data value's sources name its position, which a view can take at the end of its list.
CREATE OR REPLACE VIEW published.indicator_source AS
SELECT cpv.indicator_id, s.part, s.position, s.provider_id, s.source_id, s.data_value_position
FROM current_published_version cpv
JOIN indicator_version_source s ON s.indicator_version_id = cpv.id;--> statement-breakpoint
CREATE VIEW published.indicator_data_value AS
SELECT cpv.indicator_id, d.position, d.definition, d.disclosure_control_detail
FROM current_published_version cpv
JOIN indicator_version_data_value d ON d.indicator_version_id = cpv.id;--> statement-breakpoint
GRANT SELECT ON published.indicator_data_value TO public_api, internal_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON indicator_version_data_value TO internal_api;
