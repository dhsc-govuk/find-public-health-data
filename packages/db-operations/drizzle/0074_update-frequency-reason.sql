ALTER TABLE "indicator_version" ADD COLUMN "update_frequency_reason" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_update_frequency_reason_check" CHECK ("indicator_version"."update_frequency_reason" IS NULL OR ("indicator_version"."update_frequency" IN ('no-fixed-frequency', 'no-longer-updated')) IS TRUE);--> statement-breakpoint
-- published.indicator gains the reason beside the update frequency. A view cannot take a column
-- in the middle of its list, so it is dropped and created again, with its grant.
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
