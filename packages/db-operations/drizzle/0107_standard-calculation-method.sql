DROP VIEW "published"."indicator";--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "standard_method_used" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_methodology_check" CHECK ("indicator_version"."standard_method_used" IS NULL OR ("indicator_version"."standard_method_used" IS FALSE) = ("indicator_version"."methodology" IS NOT NULL));--> statement-breakpoint
CREATE VIEW "published"."indicator" AS (
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
  v.standard_method_used,
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
GRANT SELECT ON published.indicator TO public_api, internal_api;
