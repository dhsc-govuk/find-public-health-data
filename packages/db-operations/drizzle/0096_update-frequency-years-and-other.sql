ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_update_frequency_check";--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "update_frequency_years" smallint;--> statement-breakpoint
-- The description of how often an indicator is updated belongs to "Other" alone. A version that
-- gave a reason keeps its answer and the reason, and loses the description.
UPDATE "indicator_version" SET "update_frequency_text" = NULL
WHERE "update_frequency_text" IS NOT NULL AND "update_frequency_reason" IS NOT NULL;--> statement-breakpoint
-- Any other version with a description becomes "Other", so its public page keeps the wording.
UPDATE "indicator_version" SET "update_frequency" = 'other'
WHERE "update_frequency_text" IS NOT NULL;--> statement-breakpoint
UPDATE "indicator_version" SET "update_frequency" = 'every-n-years', "update_frequency_years" = 2
WHERE "update_frequency" = 'every-2-years';--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_update_frequency_years_check" CHECK (("indicator_version"."update_frequency" IS NOT DISTINCT FROM 'every-n-years') = ("indicator_version"."update_frequency_years" IS NOT NULL) AND "indicator_version"."update_frequency_years" BETWEEN 2 AND 99);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_update_frequency_text_check" CHECK (("indicator_version"."update_frequency" IS NOT DISTINCT FROM 'other') = ("indicator_version"."update_frequency_text" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_update_frequency_check" CHECK ("indicator_version"."update_frequency" IN ('monthly', 'quarterly', 'annually', 'every-n-years', 'other', 'no-fixed-frequency', 'no-longer-updated'));--> statement-breakpoint
-- A view cannot take a column in the middle of its list, so it is recreated with its grant.
DROP VIEW published.indicator;--> statement-breakpoint
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
  v.update_frequency_reason,
  v.update_frequency_text,
  v.update_frequency_years,
  v.comparator_method_id,
  v.has_goal_benchmark,
  v.goal_lower_value,
  v.goal_upper_value,
  v.goal_polarity,
  v.goal_policy_detail,
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
