CREATE TABLE "indicator_version_goal" (
	"indicator_version_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"lower_comparison" text NOT NULL,
	"lower_value" double precision NOT NULL,
	"upper_comparison" text,
	"upper_value" double precision,
	"polarity" text NOT NULL,
	"policy_detail" text,
	CONSTRAINT "indicator_version_goal_indicator_version_id_position_pk" PRIMARY KEY("indicator_version_id","position"),
	CONSTRAINT "indicator_version_goal_position_check" CHECK ("indicator_version_goal"."position" >= 0),
	CONSTRAINT "indicator_version_goal_lower_comparison_check" CHECK ("indicator_version_goal"."lower_comparison" IN ('less-than', 'less-than-or-equal')),
	CONSTRAINT "indicator_version_goal_upper_comparison_check" CHECK ("indicator_version_goal"."upper_comparison" IN ('more-than', 'more-than-or-equal')),
	CONSTRAINT "indicator_version_goal_polarity_check" CHECK ("indicator_version_goal"."polarity" IN ('higher-is-better', 'lower-is-better')),
	CONSTRAINT "indicator_version_goal_upper_pair_check" CHECK (("indicator_version_goal"."upper_value" IS NULL) = ("indicator_version_goal"."upper_comparison" IS NULL)),
	CONSTRAINT "indicator_version_goal_upper_value_check" CHECK ("indicator_version_goal"."upper_value" IS NULL OR "indicator_version_goal"."upper_value" > "indicator_version_goal"."lower_value"),
	CONSTRAINT "indicator_version_goal_values_check" CHECK ("indicator_version_goal"."lower_value" > '-Infinity' AND "indicator_version_goal"."lower_value" < 'Infinity' AND "indicator_version_goal"."upper_value" < 'Infinity')
);
--> statement-breakpoint
-- The goals move to indicator_version_goal, one row each. The values in the dropped columns are
-- not carried across.
DROP VIEW "published"."indicator";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_goal_polarity_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_goal_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_goal_pair_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_goal_upper_value_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_goal_policy_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_goal_values_check";--> statement-breakpoint
ALTER TABLE "indicator_version_goal" ADD CONSTRAINT "indicator_version_goal_version_fk" FOREIGN KEY ("indicator_version_id") REFERENCES "public"."indicator_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "goal_lower_value";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "goal_upper_value";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "goal_polarity";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "goal_policy_detail";--> statement-breakpoint
CREATE VIEW "published"."indicator_goal" AS (
SELECT
  cpv.indicator_id,
  g.position,
  g.lower_comparison,
  g.lower_value,
  g.upper_comparison,
  g.upper_value,
  g.polarity,
  g.policy_detail
FROM current_published_version cpv
JOIN indicator_version_goal g ON g.indicator_version_id = cpv.id
      );--> statement-breakpoint
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
  v.denominator_definition,
  v.disclosure_control_detail,
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
-- A dropped view loses its grants, so the indicator view takes them again beside the new one.
GRANT SELECT ON published.indicator, published.indicator_goal TO public_api, internal_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON indicator_version_goal TO internal_api;
