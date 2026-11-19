ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_unit_other_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_unit_other_length_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_calculated_by_other_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_copyright_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_data_reuse_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_age_other_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_disclosure_control_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_rounding_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_caveats_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_other_notes_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_source_data_issues_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_exclusions_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_automation_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_reviewer_comments_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_specific_age_type_check";--> statement-breakpoint
-- published.indicator names the two columns no page writes, so it goes before they do.
DROP VIEW published.indicator;--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "disclosure_threshold";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "config";--> statement-breakpoint
-- A detail the contract requires beside a yes is held beside a yes and nothing else; a violating
-- row stops the migration.
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_unit_detail_check" CHECK (("indicator_version"."unit_detail" IS NOT NULL) = ("indicator_version"."unit_id" IS NOT DISTINCT FROM '01a0d8a5-3ca2-7315-bfca-96e5cee57158'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_unit_detail_length_check" CHECK (length("indicator_version"."unit_detail") <= 100);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_ci_method_modifications_detail_check" CHECK (("indicator_version"."has_ci_method_modifications" IS TRUE) = ("indicator_version"."ci_method_modifications_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_calculated_by_detail_check" CHECK (("indicator_version"."calculated_by" IS NOT DISTINCT FROM 'other') = ("indicator_version"."calculated_by_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_custom_copyright_detail_check" CHECK (("indicator_version"."has_custom_copyright" IS TRUE) = ("indicator_version"."custom_copyright_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_custom_data_reuse_detail_check" CHECK (("indicator_version"."has_custom_data_reuse" IS TRUE) = ("indicator_version"."custom_data_reuse_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_age_detail_check" CHECK (("indicator_version"."age_type" IS NOT DISTINCT FROM 'other') = ("indicator_version"."age_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_disclosure_control_detail_check" CHECK (("indicator_version"."disclosure_control" IS NOT DISTINCT FROM 'yes') = ("indicator_version"."disclosure_control_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_rounding_detail_check" CHECK (("indicator_version"."has_rounding" IS TRUE) = ("indicator_version"."rounding_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_caveats_detail_check" CHECK (("indicator_version"."has_caveats" IS TRUE) = ("indicator_version"."caveats_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_other_notes_detail_check" CHECK (("indicator_version"."has_other_notes" IS TRUE) = ("indicator_version"."other_notes_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_source_data_issues_detail_check" CHECK (("indicator_version"."has_source_data_issues" IS TRUE) = ("indicator_version"."source_data_issues_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_exclusions_detail_check" CHECK (("indicator_version"."has_exclusions" IS TRUE) = ("indicator_version"."exclusions_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_automation_detail_check" CHECK (("indicator_version"."has_automation" IS TRUE) = ("indicator_version"."automation_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_reviewer_comments_detail_check" CHECK (("indicator_version"."has_reviewer_comments" IS TRUE) = ("indicator_version"."reviewer_comments_detail" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_specific_age_type_check" CHECK (("indicator_version"."age_type" IS NOT DISTINCT FROM 'specific') = ("indicator_version"."specific_age" IS NOT NULL));--> statement-breakpoint
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
  v.unit_detail,
  v.year_type,
  v.year_end_day,
  v.year_end_month,
  v.ci_method_id,
  v.polarity,
  v.update_frequency,
  v.comparator_method_id,
  v.ci_confidence_level,
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
