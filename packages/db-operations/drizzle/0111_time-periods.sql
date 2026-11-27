-- The published indicator view selects the year type columns, so it goes first and is recreated
-- at the end with the time periods columns. The published grouping view reads it, so that goes
-- before it and comes back after it, unchanged.
DROP VIEW "published"."indicator_grouping";--> statement-breakpoint
DROP VIEW "published"."indicator";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_period_type_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_year_type_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_year_type_period_check";--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "time_periods" text[];--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "multiple_years_count" smallint;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "multiple_years_year_type" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "multiple_years_end_day" smallint;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "multiple_years_end_month" smallint;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "date_range_start_day" smallint;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "date_range_start_month" smallint;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "date_range_end_day" smallint;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "date_range_end_month" smallint;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "periods_rolling" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "rolling_frequency" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "values_cumulative" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "period_type";--> statement-breakpoint
-- Every environment is wiped and reimported in this release, so the year types versions hold are
-- cleared rather than moved into the time periods answers. The new checks then hold for every row.
UPDATE "indicator_version" SET "year_type" = NULL, "year_end_day" = NULL, "year_end_month" = NULL;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_time_periods_check" CHECK ("indicator_version"."time_periods" <@ ARRAY['multiple-years', 'single-years', 'quarters', 'months', 'date-range']::text[] AND cardinality("indicator_version"."time_periods") > 0);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_multiple_years_count_check" CHECK ("indicator_version"."multiple_years_count" BETWEEN 2 AND 99);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_multiple_years_count_period_check" CHECK ((("indicator_version"."time_periods" @> ARRAY['multiple-years']::text[]) IS TRUE) = ("indicator_version"."multiple_years_count" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_multiple_years_year_type_check" CHECK ("indicator_version"."multiple_years_year_type" IN ('calendar', 'financial', 'academic', 'specified-end-date'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_multiple_years_year_type_period_check" CHECK ((("indicator_version"."time_periods" @> ARRAY['multiple-years']::text[]) IS TRUE) = ("indicator_version"."multiple_years_year_type" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_multiple_years_end_check" CHECK (("indicator_version"."multiple_years_end_day" IS NOT NULL) = ("indicator_version"."multiple_years_year_type" IS NOT DISTINCT FROM 'specified-end-date') AND ("indicator_version"."multiple_years_end_month" IS NOT NULL) = ("indicator_version"."multiple_years_end_day" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_multiple_years_end_date_check" CHECK ("indicator_version"."multiple_years_end_month" BETWEEN 1 AND 12 AND "indicator_version"."multiple_years_end_day" BETWEEN 1 AND CASE WHEN "indicator_version"."multiple_years_end_month" = 2 THEN 29 WHEN "indicator_version"."multiple_years_end_month" IN (4, 6, 9, 11) THEN 30 ELSE 31 END);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_date_range_check" CHECK ((("indicator_version"."time_periods" @> ARRAY['date-range']::text[]) IS TRUE) = ("indicator_version"."date_range_start_day" IS NOT NULL) AND ("indicator_version"."date_range_start_month" IS NOT NULL) = ("indicator_version"."date_range_start_day" IS NOT NULL) AND ("indicator_version"."date_range_end_day" IS NOT NULL) = ("indicator_version"."date_range_start_day" IS NOT NULL) AND ("indicator_version"."date_range_end_month" IS NOT NULL) = ("indicator_version"."date_range_start_day" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_date_range_start_date_check" CHECK ("indicator_version"."date_range_start_month" BETWEEN 1 AND 12 AND "indicator_version"."date_range_start_day" BETWEEN 1 AND CASE WHEN "indicator_version"."date_range_start_month" = 2 THEN 29 WHEN "indicator_version"."date_range_start_month" IN (4, 6, 9, 11) THEN 30 ELSE 31 END);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_date_range_end_date_check" CHECK ("indicator_version"."date_range_end_month" BETWEEN 1 AND 12 AND "indicator_version"."date_range_end_day" BETWEEN 1 AND CASE WHEN "indicator_version"."date_range_end_month" = 2 THEN 29 WHEN "indicator_version"."date_range_end_month" IN (4, 6, 9, 11) THEN 30 ELSE 31 END);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_rolling_frequency_check" CHECK ("indicator_version"."rolling_frequency" IN ('years', 'quarters', 'months'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_rolling_frequency_rolling_check" CHECK (("indicator_version"."periods_rolling" IS TRUE) = ("indicator_version"."rolling_frequency" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_year_type_check" CHECK ("indicator_version"."year_type" IN ('calendar', 'financial', 'academic', 'specified-end-date'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_year_type_period_check" CHECK ((("indicator_version"."time_periods" @> ARRAY['single-years']::text[]) IS TRUE) = ("indicator_version"."year_type" IS NOT NULL));--> statement-breakpoint
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
  v.time_periods,
  v.multiple_years_count,
  v.multiple_years_year_type,
  v.multiple_years_end_day,
  v.multiple_years_end_month,
  v.year_type,
  v.year_end_day,
  v.year_end_month,
  v.date_range_start_day,
  v.date_range_start_month,
  v.date_range_end_day,
  v.date_range_end_month,
  v.periods_rolling,
  v.rolling_frequency,
  v.values_cumulative,
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
-- Recreating the views removes their explicit read grants.
GRANT SELECT ON published.indicator TO public_api, internal_api;--> statement-breakpoint
CREATE VIEW "published"."indicator_grouping" AS (SELECT g.* FROM public.indicator_grouping g
        WHERE g.indicator_id IN (SELECT id FROM "published".indicator));--> statement-breakpoint
GRANT SELECT ON published.indicator_grouping TO public_api, internal_api;
