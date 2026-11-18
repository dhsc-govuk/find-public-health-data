-- btree_gist backs the exclusion constraints on area validity ranges and indicator slugs. pg_trgm
-- backs the trigram search indexes.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE SCHEMA "published";
--> statement-breakpoint
CREATE SEQUENCE "public"."indicator_short_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100000 CACHE 1;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"changes" jsonb NOT NULL,
	"request_id" uuid,
	CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" IN ('topic.created', 'topic.updated', 'topic.deleted', 'indicator.draft_created', 'indicator.draft_updated', 'indicator.draft_created_from_published', 'indicator.data_table_confirmed', 'indicator.submitted', 'indicator.submission_withdrawn', 'indicator.update_sent_to_imrg', 'indicator.update_revisions_requested', 'indicator.update_approved', 'indicator.reviewers_assigned', 'indicator.review_feedback_given', 'indicator.changes_requested', 'indicator.approved', 'indicator.resubmitted', 'indicator.revision_response_updated', 'indicator.publication_scheduled', 'indicator.publication_date_changed', 'indicator.published', 'indicator.review_note_added', 'indicator.review_note_updated', 'upload_batch.loaded', 'upload_batch.refused', 'upload_batch.deleted')),
	CONSTRAINT "audit_log_entity_type_check" CHECK ("audit_log"."entity_type" = split_part("audit_log"."action", '.', 1)),
	CONSTRAINT "audit_log_changes_check" CHECK (jsonb_typeof("audit_log"."changes") = 'object')
);
--> statement-breakpoint
CREATE TABLE "available_data" (
	"indicator_id" uuid NOT NULL,
	"area_type_id" uuid NOT NULL,
	"area_type_name" text NOT NULL,
	"area_count" integer NOT NULL,
	CONSTRAINT "available_data_indicator_id_area_type_id_pk" PRIMARY KEY("indicator_id","area_type_id")
);
--> statement-breakpoint
CREATE TABLE "observation_range" (
	"indicator_id" uuid NOT NULL,
	"display_group" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"segment" text NOT NULL,
	"min" double precision NOT NULL,
	"max" double precision NOT NULL,
	"p25" double precision,
	"p75" double precision,
	"quintile_cutoffs" double precision[],
	CONSTRAINT "observation_range_pk" PRIMARY KEY("indicator_id","display_group","from_date","to_date","segment")
);
--> statement-breakpoint
CREATE TABLE "observation_series" (
	"upload_batch_id" uuid NOT NULL,
	"indicator_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"dimension_key" text NOT NULL,
	"sex" text NOT NULL,
	"period_type" text NOT NULL,
	"variants" jsonb NOT NULL,
	"latest_observation_id" uuid NOT NULL,
	"ranking_observation_id" uuid,
	"recent_observation_ids" uuid[] NOT NULL,
	"sparkline_observation_ids" uuid[],
	"recent_values" double precision[] NOT NULL,
	CONSTRAINT "observation_series_upload_batch_id_area_id_sex_period_type_pk" PRIMARY KEY("upload_batch_id","area_id","sex","period_type")
);
--> statement-breakpoint
CREATE TABLE "observation_series_batch" (
	"trend_values" double precision[],
	"upload_batch_id" uuid PRIMARY KEY NOT NULL,
	"indicator_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"dimension" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classification_slug_unique" UNIQUE("slug"),
	CONSTRAINT "classification_dimension_check" CHECK ("classification"."dimension" IN ('indicator_type', 'population', 'inequality', 'framework', 'life_stage', 'risk_factor'))
);
--> statement-breakpoint
CREATE TABLE "indicator_version_classification" (
	"indicator_version_id" uuid NOT NULL,
	"classification_id" uuid NOT NULL,
	CONSTRAINT "indicator_version_classification_pk" PRIMARY KEY("indicator_version_id","classification_id")
);
--> statement-breakpoint
CREATE TABLE "data_migration" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"package_sha256" text NOT NULL,
	"predecessor_id" text,
	"source_snapshot_at" timestamp with time zone NOT NULL,
	"source_cutoff_at" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"table_changes" jsonb NOT NULL,
	CONSTRAINT "data_migration_kind_check" CHECK ("data_migration"."kind" IN ('baseline', 'incremental')),
	CONSTRAINT "data_migration_sha256_check" CHECK ("data_migration"."package_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "dimension_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"dimension_class" text NOT NULL,
	"classification_scheme" text,
	"granularity" text,
	"is_required" boolean DEFAULT false NOT NULL,
	CONSTRAINT "dimension_type_name_unique" UNIQUE("name"),
	CONSTRAINT "dimension_type_dimension_class_check" CHECK ("dimension_type"."dimension_class" IN ('core', 'inequality', 'demographic', 'clinical'))
);
--> statement-breakpoint
CREATE TABLE "dimension_value" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"dimension_type_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"code" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_aggregate" boolean DEFAULT false NOT NULL,
	CONSTRAINT "dimension_value_dimension_type_id_name_unique" UNIQUE("dimension_type_id","name"),
	CONSTRAINT "dimension_value_id_dimension_type_id_unique" UNIQUE("id","dimension_type_id")
);
--> statement-breakpoint
CREATE TABLE "area" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"area_type_id" uuid NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"is_current" boolean DEFAULT true NOT NULL,
	CONSTRAINT "area_validity_order_check" CHECK ("area"."valid_to" IS NULL OR "area"."valid_from" <= "area"."valid_to")
);
--> statement-breakpoint
CREATE TABLE "area_category" (
	"area_id" uuid NOT NULL,
	"dimension_value_id" uuid NOT NULL,
	CONSTRAINT "area_category_area_id_dimension_value_id_pk" PRIMARY KEY("area_id","dimension_value_id")
);
--> statement-breakpoint
CREATE TABLE "area_neighbour" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"area_id" uuid NOT NULL,
	"neighbour_area_id" uuid NOT NULL,
	"scheme" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "area_neighbour_position_check" CHECK ("area_neighbour"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "area_relationship" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"parent_area_id" uuid NOT NULL,
	"child_area_id" uuid NOT NULL,
	"valid_from" date,
	"valid_to" date,
	CONSTRAINT "area_relationship_validity_order_check" CHECK ("area_relationship"."valid_to" IS NULL OR "area_relationship"."valid_from" <= "area_relationship"."valid_to")
);
--> statement-breakpoint
CREATE TABLE "area_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"hierarchy_type" text NOT NULL,
	"display_group" text,
	"display_order" integer,
	CONSTRAINT "area_type_name_unique" UNIQUE("name"),
	CONSTRAINT "area_type_hierarchy_type_check" CHECK ("area_type"."hierarchy_type" IN ('NHS', 'Administrative'))
);
--> statement-breakpoint
CREATE TABLE "indicator" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"short_id" integer DEFAULT nextval('indicator_short_id_seq') NOT NULL,
	"data_updated_at" timestamp with time zone,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_short_id_unique" UNIQUE("short_id")
);
--> statement-breakpoint
CREATE TABLE "indicator_version" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"scheduled_publish_at" timestamp with time zone,
	"fast_track_reason" text,
	"upload_batch_id" uuid,
	"data_table_confirmed_at" timestamp with time zone,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"value_type_id" uuid,
	"standard_population" text,
	"standard_population_detail" text,
	"unit_id" uuid,
	"unit_detail" text,
	"demographics" text[],
	"sexes" text[],
	"genders" text[],
	"ethnic_groups" text[],
	"age_type" text,
	"specific_age" smallint,
	"specific_age_unit" text,
	"age_detail" text,
	"period_type" text,
	"year_type" text,
	"year_end_day" smallint,
	"year_end_month" smallint,
	"polarity" text,
	"has_data_quality_issues" boolean,
	"definition" text,
	"rationale" text,
	"numerator_definition" text,
	"denominator_definition" text,
	"data_source_id" uuid,
	"methodology" text,
	"calculated_by" text,
	"calculated_by_detail" text,
	"ci_method_id" uuid,
	"has_ci_method_modifications" boolean,
	"ci_method_modifications_detail" text,
	"ci_method_detail" text,
	"ci_confidence_level" text,
	"comparator_method_id" uuid,
	"has_goal_benchmark" boolean,
	"goal_lower_value" double precision,
	"goal_upper_value" double precision,
	"goal_polarity" text,
	"goal_policy_detail" text,
	"disclosure_control" text,
	"disclosure_control_detail" text,
	"has_rounding" boolean,
	"rounding_detail" text,
	"has_caveats" boolean,
	"caveats_detail" text,
	"has_other_notes" boolean,
	"other_notes_detail" text,
	"has_risk_factor" boolean,
	"has_framework" boolean,
	"phof_indicator_number" text,
	"has_life_stage" boolean,
	"update_frequency" text,
	"update_frequency_reason" text,
	"update_frequency_text" text,
	"variation" text,
	"quality_assurance" text,
	"source_data_issues_detail" text,
	"ci_method_justification" text,
	"data_sources_justification" text,
	"inequalities_included" text,
	"has_exclusions" boolean,
	"exclusions_detail" text,
	"has_automation" boolean,
	"automation_detail" text,
	"no_automation_reason" text,
	"sponsors_and_stakeholders" text,
	"has_reviewer_comments" boolean,
	"reviewer_comments_detail" text,
	"update_summary" text,
	"update_summary_for_reviewers" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "indicator_version_id_indicator_id_unique" UNIQUE("id","indicator_id"),
	CONSTRAINT "indicator_version_ci_confidence_level_check" CHECK ("indicator_version"."ci_confidence_level" IN ('95', '99.8', 'both')),
	CONSTRAINT "indicator_version_status_check" CHECK ("indicator_version"."status" IN ('draft', 'scheduled', 'published')),
	CONSTRAINT "indicator_version_polarity_check" CHECK ("indicator_version"."polarity" IN ('higher-is-better', 'lower-is-better', 'no-polarity', 'no-comparison-possible')),
	CONSTRAINT "indicator_version_update_frequency_check" CHECK ("indicator_version"."update_frequency" IN ('monthly', 'quarterly', 'annually', 'every-2-years', 'no-fixed-frequency', 'no-longer-updated')),
	CONSTRAINT "indicator_version_update_frequency_reason_check" CHECK ("indicator_version"."update_frequency_reason" IS NULL OR ("indicator_version"."update_frequency" IN ('no-fixed-frequency', 'no-longer-updated')) IS TRUE),
	CONSTRAINT "indicator_version_standard_population_check" CHECK ("indicator_version"."standard_population" IN ('esp-2013', 'other')),
	CONSTRAINT "indicator_version_standard_population_value_type_check" CHECK ("indicator_version"."standard_population" IS NULL OR "indicator_version"."value_type_id" = '01a0d8a5-3ca2-7315-bfca-96c9664c846c'),
	CONSTRAINT "indicator_version_standard_population_detail_check" CHECK ("indicator_version"."standard_population_detail" IS NULL OR "indicator_version"."standard_population" IS NOT DISTINCT FROM 'other' OR "indicator_version"."value_type_id" IN ('01a0d8a5-3ca2-7315-bfca-96cc2dc711c3', '01a0d8a5-3ca2-7315-bfca-96cda63ea940')),
	CONSTRAINT "indicator_version_standard_population_other_check" CHECK ("indicator_version"."standard_population" IS DISTINCT FROM 'other' OR "indicator_version"."standard_population_detail" IS NOT NULL),
	CONSTRAINT "indicator_version_unit_detail_check" CHECK (("indicator_version"."unit_detail" IS NOT NULL) = ("indicator_version"."unit_id" IS NOT DISTINCT FROM '01a0d8a5-3ca2-7315-bfca-96e5cee57158')),
	CONSTRAINT "indicator_version_ci_method_modifications_detail_check" CHECK (("indicator_version"."has_ci_method_modifications" IS TRUE) = ("indicator_version"."ci_method_modifications_detail" IS NOT NULL)),
	CONSTRAINT "indicator_version_calculated_by_check" CHECK ("indicator_version"."calculated_by" IN ('ohid', 'dhsc', 'other')),
	CONSTRAINT "indicator_version_calculated_by_detail_check" CHECK (("indicator_version"."calculated_by" IS NOT DISTINCT FROM 'other') = ("indicator_version"."calculated_by_detail" IS NOT NULL)),
	CONSTRAINT "indicator_version_disclosure_control_check" CHECK ("indicator_version"."disclosure_control" IN ('yes', 'no', 'not-applicable')),
	CONSTRAINT "indicator_version_disclosure_control_detail_check" CHECK (("indicator_version"."disclosure_control" IS NOT DISTINCT FROM 'yes') = ("indicator_version"."disclosure_control_detail" IS NOT NULL)),
	CONSTRAINT "indicator_version_rounding_detail_check" CHECK (("indicator_version"."has_rounding" IS TRUE) = ("indicator_version"."rounding_detail" IS NOT NULL)),
	CONSTRAINT "indicator_version_caveats_detail_check" CHECK (("indicator_version"."has_caveats" IS TRUE) = ("indicator_version"."caveats_detail" IS NOT NULL)),
	CONSTRAINT "indicator_version_other_notes_detail_check" CHECK (("indicator_version"."has_other_notes" IS TRUE) = ("indicator_version"."other_notes_detail" IS NOT NULL)),
	CONSTRAINT "indicator_version_goal_polarity_check" CHECK ("indicator_version"."goal_polarity" IN ('higher-is-better', 'lower-is-better')),
	CONSTRAINT "indicator_version_goal_check" CHECK (("indicator_version"."has_goal_benchmark" IS TRUE) = ("indicator_version"."goal_lower_value" IS NOT NULL)),
	CONSTRAINT "indicator_version_goal_pair_check" CHECK (("indicator_version"."goal_lower_value" IS NULL) = ("indicator_version"."goal_polarity" IS NULL)),
	CONSTRAINT "indicator_version_goal_upper_value_check" CHECK ("indicator_version"."goal_upper_value" IS NULL OR ("indicator_version"."goal_lower_value" IS NOT NULL AND "indicator_version"."goal_upper_value" > "indicator_version"."goal_lower_value")),
	CONSTRAINT "indicator_version_goal_policy_detail_check" CHECK ("indicator_version"."has_goal_benchmark" IS TRUE OR "indicator_version"."goal_policy_detail" IS NULL),
	CONSTRAINT "indicator_version_goal_values_check" CHECK ("indicator_version"."goal_lower_value" > '-Infinity' AND "indicator_version"."goal_lower_value" < 'Infinity' AND "indicator_version"."goal_upper_value" < 'Infinity'),
	CONSTRAINT "indicator_version_exclusions_detail_check" CHECK (("indicator_version"."has_exclusions" IS TRUE) = ("indicator_version"."exclusions_detail" IS NOT NULL)),
	CONSTRAINT "indicator_version_automation_detail_check" CHECK (("indicator_version"."has_automation" IS TRUE) = ("indicator_version"."automation_detail" IS NOT NULL)),
	CONSTRAINT "indicator_version_no_automation_reason_check" CHECK (("indicator_version"."has_automation" IS FALSE) = ("indicator_version"."no_automation_reason" IS NOT NULL)),
	CONSTRAINT "indicator_version_reviewer_comments_detail_check" CHECK (("indicator_version"."has_reviewer_comments" IS TRUE) = ("indicator_version"."reviewer_comments_detail" IS NOT NULL)),
	CONSTRAINT "indicator_version_demographics_check" CHECK ("indicator_version"."demographics" <@ ARRAY['sex', 'gender', 'ethnicity']::text[] AND cardinality("indicator_version"."demographics") > 0),
	CONSTRAINT "indicator_version_sexes_check" CHECK ("indicator_version"."sexes" <@ ARRAY['persons', 'females', 'males']::text[] AND cardinality("indicator_version"."sexes") > 0),
	CONSTRAINT "indicator_version_sexes_demographic_check" CHECK ((("indicator_version"."demographics" @> ARRAY['sex']::text[]) IS TRUE) = ("indicator_version"."sexes" IS NOT NULL)),
	CONSTRAINT "indicator_version_genders_check" CHECK ("indicator_version"."genders" <@ ARRAY['persons', 'women-and-girls', 'men-and-boys', 'non-binary', 'other', 'prefer-not-to-say']::text[] AND cardinality("indicator_version"."genders") > 0),
	CONSTRAINT "indicator_version_genders_demographic_check" CHECK ((("indicator_version"."demographics" @> ARRAY['gender']::text[]) IS TRUE) = ("indicator_version"."genders" IS NOT NULL)),
	CONSTRAINT "indicator_version_ethnic_groups_check" CHECK ("indicator_version"."ethnic_groups" <@ ARRAY['asian', 'black', 'mixed', 'white', 'other']::text[] AND cardinality("indicator_version"."ethnic_groups") > 0),
	CONSTRAINT "indicator_version_ethnic_groups_demographic_check" CHECK ((("indicator_version"."demographics" @> ARRAY['ethnicity']::text[]) IS TRUE) = ("indicator_version"."ethnic_groups" IS NOT NULL)),
	CONSTRAINT "indicator_version_age_type_check" CHECK ("indicator_version"."age_type" IN ('all', 'range', 'specific', 'other')),
	CONSTRAINT "indicator_version_specific_age_unit_check" CHECK ("indicator_version"."specific_age_unit" IN ('days', 'weeks', 'months', 'years')),
	CONSTRAINT "indicator_version_specific_age_check" CHECK ("indicator_version"."specific_age" BETWEEN 0 AND 999),
	CONSTRAINT "indicator_version_specific_age_pair_check" CHECK (("indicator_version"."specific_age" IS NULL) = ("indicator_version"."specific_age_unit" IS NULL)),
	CONSTRAINT "indicator_version_specific_age_type_check" CHECK (("indicator_version"."age_type" IS NOT DISTINCT FROM 'specific') = ("indicator_version"."specific_age" IS NOT NULL)),
	CONSTRAINT "indicator_version_age_detail_check" CHECK (("indicator_version"."age_type" IS NOT DISTINCT FROM 'other') = ("indicator_version"."age_detail" IS NOT NULL)),
	CONSTRAINT "indicator_version_period_type_check" CHECK ("indicator_version"."period_type" IN ('years', 'quarters', 'months')),
	CONSTRAINT "indicator_version_year_type_check" CHECK ("indicator_version"."year_type" IN ('calendar', 'financial', 'academic', 'rolling', 'specified-end-date')),
	CONSTRAINT "indicator_version_year_type_period_check" CHECK (("indicator_version"."year_type" IS NOT NULL) = ("indicator_version"."period_type" IS NOT NULL AND "indicator_version"."period_type" IN ('years', 'quarters'))),
	CONSTRAINT "indicator_version_year_end_check" CHECK (("indicator_version"."year_end_day" IS NOT NULL) = ("indicator_version"."year_type" IS NOT DISTINCT FROM 'specified-end-date') AND ("indicator_version"."year_end_month" IS NOT NULL) = ("indicator_version"."year_end_day" IS NOT NULL)),
	CONSTRAINT "indicator_version_year_end_date_check" CHECK ("indicator_version"."year_end_month" BETWEEN 1 AND 12 AND "indicator_version"."year_end_day" BETWEEN 1 AND CASE WHEN "indicator_version"."year_end_month" = 2 THEN 29 WHEN "indicator_version"."year_end_month" IN (4, 6, 9, 11) THEN 30 ELSE 31 END),
	CONSTRAINT "indicator_version_data_table_confirmed_check" CHECK ("indicator_version"."data_table_confirmed_at" IS NULL OR "indicator_version"."upload_batch_id" IS NOT NULL),
	CONSTRAINT "indicator_version_published_at_check" CHECK (("indicator_version"."status" = 'published') = ("indicator_version"."published_at" IS NOT NULL)),
	CONSTRAINT "indicator_version_slug_check" CHECK ("indicator_version"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND "indicator_version"."slug" !~ '^[0-9]+$' AND length("indicator_version"."slug") <= 200)
);
--> statement-breakpoint
CREATE TABLE "indicator_version_age_range" (
	"indicator_version_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"lower_limit" smallint,
	"lower_limit_unit" text,
	"upper_limit" smallint,
	"upper_limit_unit" text,
	CONSTRAINT "indicator_version_age_range_indicator_version_id_position_pk" PRIMARY KEY("indicator_version_id","position"),
	CONSTRAINT "indicator_version_age_range_position_check" CHECK ("indicator_version_age_range"."position" >= 0),
	CONSTRAINT "indicator_version_age_range_lower_limit_unit_check" CHECK ("indicator_version_age_range"."lower_limit_unit" IN ('days', 'weeks', 'months', 'years')),
	CONSTRAINT "indicator_version_age_range_upper_limit_unit_check" CHECK ("indicator_version_age_range"."upper_limit_unit" IN ('days', 'weeks', 'months', 'years')),
	CONSTRAINT "indicator_version_age_range_limits_check" CHECK ("indicator_version_age_range"."lower_limit" BETWEEN 0 AND 999 AND "indicator_version_age_range"."upper_limit" BETWEEN 0 AND 999),
	CONSTRAINT "indicator_version_age_range_lower_limit_pair_check" CHECK (("indicator_version_age_range"."lower_limit" IS NULL) = ("indicator_version_age_range"."lower_limit_unit" IS NULL)),
	CONSTRAINT "indicator_version_age_range_upper_limit_pair_check" CHECK (("indicator_version_age_range"."upper_limit" IS NULL) = ("indicator_version_age_range"."upper_limit_unit" IS NULL)),
	CONSTRAINT "indicator_version_age_range_limit_check" CHECK ("indicator_version_age_range"."lower_limit" IS NOT NULL OR "indicator_version_age_range"."upper_limit" IS NOT NULL),
	CONSTRAINT "indicator_version_age_range_order_check" CHECK ("indicator_version_age_range"."upper_limit" * CASE "indicator_version_age_range"."upper_limit_unit" WHEN 'days' THEN 1 WHEN 'weeks' THEN 7 WHEN 'months' THEN 30.4375 WHEN 'years' THEN 365.25 END >= "indicator_version_age_range"."lower_limit" * CASE "indicator_version_age_range"."lower_limit_unit" WHEN 'days' THEN 1 WHEN 'weeks' THEN 7 WHEN 'months' THEN 30.4375 WHEN 'years' THEN 365.25 END)
);
--> statement-breakpoint
CREATE TABLE "indicator_version_source" (
	"indicator_version_id" uuid NOT NULL,
	"part" text NOT NULL,
	"position" smallint NOT NULL,
	"provider_id" uuid NOT NULL,
	"source_id" uuid,
	CONSTRAINT "indicator_version_source_indicator_version_id_part_position_pk" PRIMARY KEY("indicator_version_id","part","position"),
	CONSTRAINT "indicator_version_source_pair_unique" UNIQUE NULLS NOT DISTINCT("indicator_version_id","part","provider_id","source_id"),
	CONSTRAINT "indicator_version_source_part_check" CHECK ("indicator_version_source"."part" IN ('numerator', 'denominator')),
	CONSTRAINT "indicator_version_source_position_check" CHECK ("indicator_version_source"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ci_method" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'standard' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ci_method_name_unique" UNIQUE("name"),
	CONSTRAINT "ci_method_kind_check" CHECK ("ci_method"."kind" IN ('standard', 'other', 'none'))
);
--> statement-breakpoint
CREATE TABLE "comparator_method" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comparator_method_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "data_provider" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_provider_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "data_provider_source" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_provider_source_provider_id_name_unique" UNIQUE("provider_id","name"),
	CONSTRAINT "data_provider_source_id_provider_id_unique" UNIQUE("id","provider_id")
);
--> statement-breakpoint
CREATE TABLE "data_source" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"url" text
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "value_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "value_type_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "note_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"text" text NOT NULL,
	"category" text NOT NULL,
	CONSTRAINT "note_type_text_unique" UNIQUE("text"),
	CONSTRAINT "note_type_category_check" CHECK ("note_type"."category" IN ('disclosure', 'quality', 'geographic', 'methodological', 'estimation', 'missing', 'contextual'))
);
--> statement-breakpoint
CREATE TABLE "observation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"value" double precision,
	"count" double precision,
	"numerator" double precision,
	"denominator" double precision,
	"denominator_2" double precision,
	"lower_ci_95" double precision,
	"upper_ci_95" double precision,
	"lower_ci_998" double precision,
	"upper_ci_998" double precision,
	"upload_batch_id" uuid NOT NULL,
	"dimension_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observation_date_order_check" CHECK ("observation"."from_date" <= "observation"."to_date")
);
--> statement-breakpoint
CREATE TABLE "observation_dimension" (
	"observation_id" uuid NOT NULL,
	"dimension_value_id" uuid NOT NULL,
	"dimension_type_id" uuid NOT NULL,
	CONSTRAINT "observation_dimension_pk" PRIMARY KEY("observation_id","dimension_type_id")
);
--> statement-breakpoint
CREATE TABLE "observation_note" (
	"observation_id" uuid NOT NULL,
	"note_type_id" uuid NOT NULL,
	CONSTRAINT "observation_note_pk" PRIMARY KEY("observation_id","note_type_id")
);
--> statement-breakpoint
CREATE TABLE "indicator_version_review_note" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"submission_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "indicator_version_review_note_text_check" CHECK ("indicator_version_review_note"."text" <> '')
);
--> statement-breakpoint
CREATE TABLE "indicator_version_submission" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_version_id" uuid NOT NULL,
	"indicator_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"ended_by" uuid,
	"ended_at" timestamp with time zone,
	"revision_response" text,
	"update_decision" text,
	"update_decided_by" uuid,
	"update_decided_at" timestamp with time zone,
	"update_changes" jsonb,
	CONSTRAINT "indicator_version_submission_status_check" CHECK ("indicator_version_submission"."status" IN ('submitted', 'withdrawn', 'in_review', 'changes_requested', 'approved')),
	CONSTRAINT "indicator_version_submission_number_check" CHECK ("indicator_version_submission"."number" > 0),
	CONSTRAINT "indicator_version_submission_update_changes_check" CHECK (jsonb_typeof("indicator_version_submission"."update_changes") = 'array'),
	CONSTRAINT "indicator_version_submission_update_decision_check" CHECK ("indicator_version_submission"."update_decision" IN ('imrg_review', 'request_revisions', 'publish_with_history', 'publish_without_history')),
	CONSTRAINT "indicator_version_submission_update_decided_check" CHECK (("indicator_version_submission"."update_decision" IS NULL) = ("indicator_version_submission"."update_decided_by" IS NULL) AND ("indicator_version_submission"."update_decided_by" IS NULL) = ("indicator_version_submission"."update_decided_at" IS NULL)),
	CONSTRAINT "indicator_version_submission_ended_check" CHECK (("indicator_version_submission"."status" IN ('withdrawn', 'changes_requested', 'approved')) = ("indicator_version_submission"."ended_by" IS NOT NULL) AND ("indicator_version_submission"."ended_by" IS NULL) = ("indicator_version_submission"."ended_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "indicator_version_submission_flag" (
	"response_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"notes" text NOT NULL,
	"cleared_by" uuid,
	"cleared_at" timestamp with time zone,
	CONSTRAINT "indicator_version_submission_flag_pk" PRIMARY KEY("response_id","task_key"),
	CONSTRAINT "indicator_version_submission_flag_task_key_check" CHECK ("indicator_version_submission_flag"."task_key" IN ('name', 'data-table', 'definition-and-rationale', 'polarity', 'data-quality', 'numerator', 'denominator', 'calculation', 'confidence-intervals', 'update-frequency', 'value-type-and-units', 'period-type', 'other-notes-and-caveats', 'publishing-date', 'benchmarking', 'sex-gender-and-ethnicity', 'ages', 'tagging', 'update-summary')),
	CONSTRAINT "indicator_version_submission_flag_notes_check" CHECK ("indicator_version_submission_flag"."notes" <> ''),
	CONSTRAINT "indicator_version_submission_flag_cleared_check" CHECK (("indicator_version_submission_flag"."cleared_by" IS NULL) = ("indicator_version_submission_flag"."cleared_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "indicator_version_submission_response" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"core_team_member_id" uuid,
	"kind" text NOT NULL,
	"imrg_reviewed_on" date,
	"clarification_request" text,
	"responded_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "indicator_version_submission_response_responder_check" CHECK (("indicator_version_submission_response"."reviewer_id" IS NULL) <> ("indicator_version_submission_response"."core_team_member_id" IS NULL) AND ("indicator_version_submission_response"."core_team_member_id" IS NULL OR "indicator_version_submission_response"."kind" = 'pre_imrg_feedback')),
	CONSTRAINT "indicator_version_submission_response_kind_check" CHECK ("indicator_version_submission_response"."kind" IN ('pre_imrg_feedback', 'minor_revisions', 'major_revisions', 'approved')),
	CONSTRAINT "indicator_version_submission_response_imrg_reviewed_on_check" CHECK (("indicator_version_submission_response"."imrg_reviewed_on" IS NULL) = ("indicator_version_submission_response"."kind" = 'pre_imrg_feedback') OR "indicator_version_submission_response"."kind" = 'approved'),
	CONSTRAINT "indicator_version_submission_response_clarification_check" CHECK ("indicator_version_submission_response"."clarification_request" IS NULL OR ("indicator_version_submission_response"."kind" <> 'approved' AND "indicator_version_submission_response"."clarification_request" <> ''))
);
--> statement-breakpoint
CREATE TABLE "indicator_version_submission_reviewer" (
	"submission_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "indicator_version_submission_reviewer_pk" PRIMARY KEY("submission_id","reviewer_id")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "indicator_version_subtopic" (
	"indicator_version_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"subtopic_id" uuid NOT NULL,
	CONSTRAINT "indicator_version_subtopic_pk" PRIMARY KEY("indicator_version_id","subtopic_id")
);
--> statement-breakpoint
CREATE TABLE "indicator_version_topic" (
	"indicator_version_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "indicator_version_topic_pk" PRIMARY KEY("indicator_version_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "subtopic" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"topic_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subtopic_topic_slug_unique" UNIQUE("topic_id","slug"),
	CONSTRAINT "subtopic_id_topic_unique" UNIQUE("id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "topic_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "upload_batch" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"indicator_version_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"validation_result" jsonb,
	"blob_name" text,
	"byte_size" bigint,
	"sha256" text,
	"row_count" integer,
	"column_names" text[],
	CONSTRAINT "upload_batch_id_indicator_id_unique" UNIQUE("id","indicator_id"),
	CONSTRAINT "upload_batch_status_check" CHECK ("upload_batch"."status" IN ('received', 'processed', 'failed')),
	CONSTRAINT "upload_batch_sha256_check" CHECK ("upload_batch"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"display_name" text NOT NULL,
	"kind" text NOT NULL,
	"oidc_issuer" text,
	"oidc_subject" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_oidc_identity_unique" UNIQUE("oidc_issuer","oidc_subject"),
	CONSTRAINT "app_user_kind_check" CHECK ("app_user"."kind" IN ('person', 'system')),
	CONSTRAINT "app_user_oidc_identity_check" CHECK (("app_user"."oidc_issuer" IS NULL) = ("app_user"."oidc_subject" IS NULL)),
	CONSTRAINT "app_user_system_identity_check" CHECK ("app_user"."kind" <> 'system' OR "app_user"."oidc_issuer" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_classification" ADD CONSTRAINT "indicator_version_classification_version_fk" FOREIGN KEY ("indicator_version_id") REFERENCES "public"."indicator_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_classification" ADD CONSTRAINT "indicator_version_classification_classification_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."classification"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_value" ADD CONSTRAINT "dimension_value_dimension_type_id_dimension_type_id_fk" FOREIGN KEY ("dimension_type_id") REFERENCES "public"."dimension_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_value" ADD CONSTRAINT "dimension_value_parent_id_dimension_value_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."dimension_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area" ADD CONSTRAINT "area_area_type_id_area_type_id_fk" FOREIGN KEY ("area_type_id") REFERENCES "public"."area_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_category" ADD CONSTRAINT "area_category_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_category" ADD CONSTRAINT "area_category_dimension_value_id_dimension_value_id_fk" FOREIGN KEY ("dimension_value_id") REFERENCES "public"."dimension_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_neighbour" ADD CONSTRAINT "area_neighbour_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_neighbour" ADD CONSTRAINT "area_neighbour_neighbour_area_id_area_id_fk" FOREIGN KEY ("neighbour_area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_relationship" ADD CONSTRAINT "area_relationship_parent_area_id_area_id_fk" FOREIGN KEY ("parent_area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_relationship" ADD CONSTRAINT "area_relationship_child_area_id_area_id_fk" FOREIGN KEY ("child_area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_value_type_id_value_type_id_fk" FOREIGN KEY ("value_type_id") REFERENCES "public"."value_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_data_source_id_data_source_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_ci_method_id_ci_method_id_fk" FOREIGN KEY ("ci_method_id") REFERENCES "public"."ci_method"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_comparator_method_id_comparator_method_id_fk" FOREIGN KEY ("comparator_method_id") REFERENCES "public"."comparator_method"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_upload_batch_fk" FOREIGN KEY ("upload_batch_id","indicator_id") REFERENCES "public"."upload_batch"("id","indicator_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_age_range" ADD CONSTRAINT "indicator_version_age_range_version_fk" FOREIGN KEY ("indicator_version_id") REFERENCES "public"."indicator_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_source" ADD CONSTRAINT "indicator_version_source_version_fk" FOREIGN KEY ("indicator_version_id") REFERENCES "public"."indicator_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_source" ADD CONSTRAINT "indicator_version_source_provider_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."data_provider"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_source" ADD CONSTRAINT "indicator_version_source_source_fk" FOREIGN KEY ("source_id","provider_id") REFERENCES "public"."data_provider_source"("id","provider_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_provider_source" ADD CONSTRAINT "data_provider_source_provider_id_data_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."data_provider"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_upload_batch_indicator_fk" FOREIGN KEY ("upload_batch_id","indicator_id") REFERENCES "public"."upload_batch"("id","indicator_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_dimension" ADD CONSTRAINT "observation_dimension_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_dimension" ADD CONSTRAINT "observation_dimension_value_type_fk" FOREIGN KEY ("dimension_value_id","dimension_type_id") REFERENCES "public"."dimension_value"("id","dimension_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_note" ADD CONSTRAINT "observation_note_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_note" ADD CONSTRAINT "observation_note_note_type_id_note_type_id_fk" FOREIGN KEY ("note_type_id") REFERENCES "public"."note_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_review_note" ADD CONSTRAINT "indicator_version_review_note_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."indicator_version_submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_review_note" ADD CONSTRAINT "indicator_version_review_note_author_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD CONSTRAINT "indicator_version_submission_version_fk" FOREIGN KEY ("indicator_version_id","indicator_id") REFERENCES "public"."indicator_version"("id","indicator_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD CONSTRAINT "indicator_version_submission_submitted_by_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD CONSTRAINT "indicator_version_submission_ended_by_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD CONSTRAINT "indicator_version_submission_update_decided_by_fk" FOREIGN KEY ("update_decided_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" ADD CONSTRAINT "indicator_version_submission_flag_response_fk" FOREIGN KEY ("response_id") REFERENCES "public"."indicator_version_submission_response"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" ADD CONSTRAINT "indicator_version_submission_flag_cleared_by_fk" FOREIGN KEY ("cleared_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_response" ADD CONSTRAINT "indicator_version_submission_response_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."indicator_version_submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_response" ADD CONSTRAINT "indicator_version_submission_response_reviewer_fk" FOREIGN KEY ("submission_id","reviewer_id") REFERENCES "public"."indicator_version_submission_reviewer"("submission_id","reviewer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_response" ADD CONSTRAINT "indicator_version_submission_response_core_team_member_fk" FOREIGN KEY ("core_team_member_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_reviewer" ADD CONSTRAINT "indicator_version_submission_reviewer_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."indicator_version_submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_reviewer" ADD CONSTRAINT "indicator_version_submission_reviewer_reviewer_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_reviewer" ADD CONSTRAINT "indicator_version_submission_reviewer_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_subtopic" ADD CONSTRAINT "indicator_version_subtopic_topic_fk" FOREIGN KEY ("indicator_version_id","topic_id") REFERENCES "public"."indicator_version_topic"("indicator_version_id","topic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_subtopic" ADD CONSTRAINT "indicator_version_subtopic_subtopic_fk" FOREIGN KEY ("subtopic_id","topic_id") REFERENCES "public"."subtopic"("id","topic_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_topic" ADD CONSTRAINT "indicator_version_topic_version_fk" FOREIGN KEY ("indicator_version_id") REFERENCES "public"."indicator_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_topic" ADD CONSTRAINT "indicator_version_topic_topic_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtopic" ADD CONSTRAINT "subtopic_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_uploaded_by_app_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_indicator_version_fk" FOREIGN KEY ("indicator_version_id","indicator_id") REFERENCES "public"."indicator_version"("id","indicator_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_log_entity_type_entity_id_occurred_at" ON "audit_log" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_available_data_area_indicator" ON "available_data" USING btree ("area_type_id","indicator_id");--> statement-breakpoint
CREATE INDEX "idx_observation_series_indicator_area" ON "observation_series" USING btree ("indicator_id","area_id");--> statement-breakpoint
CREATE INDEX "idx_classification_dimension" ON "classification" USING btree ("dimension");--> statement-breakpoint
CREATE INDEX "idx_indicator_version_classification_classification" ON "indicator_version_classification" USING btree ("classification_id");--> statement-breakpoint
CREATE INDEX "idx_dimension_value_type" ON "dimension_value" USING btree ("dimension_type_id");--> statement-breakpoint
CREATE INDEX "idx_dimension_value_parent" ON "dimension_value" USING btree ("parent_id") WHERE "dimension_value"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_area_type_current_name_code_id" ON "area" USING btree ("area_type_id","is_current","name","code","id");--> statement-breakpoint
CREATE INDEX "idx_area_type_validity" ON "area" USING btree ("area_type_id","valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "idx_area_category_dimension_value" ON "area_category" USING btree ("dimension_value_id","area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_area_neighbour_area_scheme_position" ON "area_neighbour" USING btree ("area_id","scheme","position");--> statement-breakpoint
CREATE INDEX "idx_area_relationship_parent" ON "area_relationship" USING btree ("parent_area_id");--> statement-breakpoint
CREATE INDEX "idx_area_relationship_child" ON "area_relationship" USING btree ("child_area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_indicator_version_one_unpublished" ON "indicator_version" USING btree ("indicator_id") WHERE "indicator_version"."status" IN ('draft', 'scheduled');--> statement-breakpoint
CREATE INDEX "idx_indicator_version_scheduled_publish_at" ON "indicator_version" USING btree ("scheduled_publish_at","id") WHERE "indicator_version"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "idx_indicator_version_indicator" ON "indicator_version" USING btree ("indicator_id");--> statement-breakpoint
CREATE INDEX "idx_indicator_version_slug" ON "indicator_version" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_indicator_version_name_trgm" ON "indicator_version" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_observation_batch_area_dates_dimension_key" ON "observation" USING btree ("upload_batch_id","area_id","from_date","to_date","dimension_key");--> statement-breakpoint
CREATE INDEX "idx_observation_indicator_dates" ON "observation" USING btree ("indicator_id","from_date","to_date");--> statement-breakpoint
CREATE INDEX "idx_observation_indicator_area_from" ON "observation" USING btree ("indicator_id","area_id","from_date");--> statement-breakpoint
CREATE INDEX "idx_observation_dimension_value" ON "observation_dimension" USING btree ("dimension_value_id");--> statement-breakpoint
CREATE INDEX "idx_indicator_version_review_note_submission_id_created_at" ON "indicator_version_review_note" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_indicator_version_submission_indicator_version_id_number" ON "indicator_version_submission" USING btree ("indicator_version_id","number");--> statement-breakpoint
CREATE INDEX "idx_indicator_version_submission_indicator_id_submitted_at" ON "indicator_version_submission" USING btree ("indicator_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_indicator_version_submission_response_submission_id" ON "indicator_version_submission_response" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_indicator_version_submission_reviewer_reviewer_id" ON "indicator_version_submission_reviewer" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "idx_indicator_version_subtopic_subtopic" ON "indicator_version_subtopic" USING btree ("subtopic_id");--> statement-breakpoint
CREATE INDEX "idx_indicator_version_topic_topic" ON "indicator_version_topic" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "idx_upload_batch_indicator_version" ON "upload_batch" USING btree ("indicator_version_id");--> statement-breakpoint
CREATE VIEW "public"."current_published_version" AS (select distinct on ("indicator_version"."indicator_id") "id", "indicator_id" from "indicator_version" where "indicator_version"."status" = 'published' order by "indicator_version"."indicator_id" asc, "indicator_version"."published_at" desc, "indicator_version"."id" desc);--> statement-breakpoint
ALTER TABLE "area" ADD CONSTRAINT "area_code_validity_excl" EXCLUDE USING gist (
  code WITH =,
  daterange(valid_from, COALESCE(valid_to, '9999-12-31'::date), '[]') WITH &&
);--> statement-breakpoint
-- A slug belongs to one indicator for ever: versions of one indicator share it, two indicators never
-- do. A draft therefore reserves its slug until it is deleted.
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_slug_indicator_excl" EXCLUDE USING gist (
  slug WITH =,
  indicator_id WITH <>
);--> statement-breakpoint
-- The published schema is the public API's whole read surface. Each view's definition holds the
-- published-only conditions, so public_api never reads a table in public.
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
CREATE VIEW published.indicator_topic AS
SELECT cpv.indicator_id, t.topic_id
FROM indicator_version_topic t
JOIN current_published_version cpv ON cpv.id = t.indicator_version_id;--> statement-breakpoint
CREATE VIEW published.indicator_classification AS
SELECT cpv.indicator_id, ic.classification_id
FROM current_published_version cpv
JOIN indicator_version_classification ic ON ic.indicator_version_id = cpv.id;--> statement-breakpoint
-- Every slug a published version carries, so an indicator's earlier addresses still
-- resolve to it. The public role reads this rather than the version table.
CREATE VIEW published.indicator_slug AS
SELECT DISTINCT v.slug, v.indicator_id
FROM indicator_version v
WHERE v.status = 'published';--> statement-breakpoint
-- Share the publication lookup across every observation read in a statement.
CREATE VIEW published.observation AS
SELECT
  o.id,
  o.indicator_id,
  o.area_id,
  o.from_date,
  o.to_date,
  o.value,
  o.count,
  o.denominator,
  o.denominator_2,
  o.lower_ci_95,
  o.upper_ci_95,
  o.lower_ci_998,
  o.upper_ci_998,
  o.created_at,
  o.numerator,
  o.dimension_key
FROM observation o
WHERE o.upload_batch_id = ANY (ARRAY(
  SELECT v.upload_batch_id
  FROM current_published_version cpv
  JOIN indicator_version v ON v.id = cpv.id
));--> statement-breakpoint
CREATE VIEW published.observation_dimension AS
SELECT od.observation_id, od.dimension_value_id, od.dimension_type_id
FROM observation_dimension od
WHERE EXISTS (
 SELECT 1 FROM observation o
 WHERE o.id = od.observation_id
 AND o.upload_batch_id = ANY (ARRAY(
  SELECT v.upload_batch_id FROM current_published_version cpv
  JOIN indicator_version v ON v.id = cpv.id
 ))
);--> statement-breakpoint
CREATE VIEW published.observation_note AS
SELECT onote.observation_id, onote.note_type_id
FROM observation_note onote
WHERE EXISTS (
 SELECT 1 FROM observation o
 WHERE o.id = onote.observation_id
 AND o.upload_batch_id = ANY (ARRAY(
  SELECT v.upload_batch_id FROM current_published_version cpv
  JOIN indicator_version v ON v.id = cpv.id
 ))
);--> statement-breakpoint
CREATE VIEW published.available_data AS
SELECT ad.indicator_id, ad.area_type_id, ad.area_type_name, ad.area_count
FROM available_data ad
WHERE ad.indicator_id = ANY (ARRAY(
  SELECT indicator_id FROM indicator_version WHERE status = 'published'
));--> statement-breakpoint
CREATE VIEW published.observation_range AS
SELECT orng.indicator_id, orng.display_group, orng.from_date, orng.to_date, orng.segment, orng.min, orng.max,
       orng.p25, orng.p75, orng.quintile_cutoffs
FROM observation_range orng
WHERE orng.indicator_id = ANY (ARRAY(
  SELECT indicator_id FROM indicator_version WHERE status = 'published'
));--> statement-breakpoint
-- Reference data is not versioned, so these views pass it through, with only the columns the public
-- API reads. They give the public role one kind of object to read, and let a definition change
-- later without touching a grant.
CREATE VIEW published.value_type AS SELECT id, name FROM value_type;--> statement-breakpoint
CREATE VIEW published.unit AS SELECT id, name FROM unit;--> statement-breakpoint
CREATE VIEW published.ci_method AS SELECT id, name, description FROM ci_method;--> statement-breakpoint
CREATE VIEW published.comparator_method AS SELECT id, name FROM comparator_method;--> statement-breakpoint
CREATE VIEW published.data_source AS SELECT * FROM data_source;--> statement-breakpoint
CREATE VIEW published.dimension_type AS SELECT * FROM dimension_type;--> statement-breakpoint
CREATE VIEW published.dimension_value AS SELECT * FROM dimension_value;--> statement-breakpoint
CREATE VIEW published.area_type AS SELECT * FROM area_type;--> statement-breakpoint
CREATE VIEW published.area AS SELECT * FROM public.area;--> statement-breakpoint
CREATE VIEW published.area_relationship AS SELECT * FROM area_relationship;--> statement-breakpoint
CREATE VIEW published.note_type AS SELECT * FROM note_type;--> statement-breakpoint
CREATE VIEW published.topic AS
SELECT id, slug, title, description, created_at, updated_at FROM topic;--> statement-breakpoint
CREATE VIEW published.classification AS
SELECT id, dimension, slug, name, created_at, updated_at FROM classification;--> statement-breakpoint
-- Follows the version published.indicator shows, as the topic memberships do.
CREATE VIEW published.indicator_source AS
SELECT cpv.indicator_id, s.part, s.position, s.provider_id, s.source_id
FROM current_published_version cpv
JOIN indicator_version_source s ON s.indicator_version_id = cpv.id;--> statement-breakpoint
CREATE VIEW published.data_provider AS SELECT id, name FROM data_provider;--> statement-breakpoint
CREATE VIEW published.data_provider_source AS SELECT id, provider_id, name FROM data_provider_source;--> statement-breakpoint
CREATE VIEW published.subtopic AS
SELECT id, topic_id, slug, title, created_at, updated_at FROM subtopic;--> statement-breakpoint
CREATE VIEW published.indicator_subtopic AS
SELECT cpv.indicator_id, s.topic_id, s.subtopic_id
FROM indicator_version_subtopic s
JOIN current_published_version cpv ON cpv.id = s.indicator_version_id;--> statement-breakpoint
CREATE VIEW published.observation_series_batch AS
SELECT b.indicator_id, b.trend_values FROM observation_series_batch b
JOIN current_published_version cpv ON cpv.indicator_id = b.indicator_id
JOIN indicator_version v ON v.id = cpv.id AND v.upload_batch_id = b.upload_batch_id;--> statement-breakpoint
CREATE VIEW published.observation_series AS
SELECT s.indicator_id, s.area_id, s.dimension_key, s.sex, s.period_type,
       s.variants, s.latest_observation_id, s.ranking_observation_id, s.recent_observation_ids,
       s.recent_values, s.sparkline_observation_ids
FROM observation_series s
JOIN current_published_version cpv ON cpv.indicator_id = s.indicator_id
JOIN indicator_version v ON v.id = cpv.id AND v.upload_batch_id = s.upload_batch_id;--> statement-breakpoint
-- The summaries of published updates for the public indicator page: those the core team chose to
-- publish with visibility in history, and those it sent for IMRG review. Only an update the core
-- team published without visibility in history is left out. An update's version carries its
-- summary, and the decision is on the version's latest submission, the one that was approved. A
-- new indicator's submissions have no decision, so its first version is never listed.
CREATE VIEW published.indicator_update_summary AS
SELECT v.indicator_id, v.published_at, v.update_summary
FROM indicator_version v
JOIN LATERAL (
  SELECT s.update_decision FROM indicator_version_submission s
  WHERE s.indicator_version_id = v.id
  ORDER BY s.number DESC
  LIMIT 1
) latest ON latest.update_decision IN ('publish_with_history', 'imrg_review')
WHERE v.status = 'published' AND v.update_summary IS NOT NULL;--> statement-breakpoint
-- Statistical neighbours are reference data, published as they are held.
CREATE VIEW published.area_neighbour AS SELECT * FROM area_neighbour;--> statement-breakpoint
CREATE VIEW published.area_category AS SELECT * FROM area_category;--> statement-breakpoint
GRANT USAGE ON SCHEMA published TO public_api, internal_api;--> statement-breakpoint
-- internal-api mounts the public routes, so it reads the same views.
GRANT SELECT ON ALL TABLES IN SCHEMA published TO public_api, internal_api;--> statement-breakpoint
-- The preview schema shows one indicator's draft as if it were published, to the internal apps
-- only. Its views are not created here: `db migrate` drops them before it migrates and recreates
-- them afterwards from the published views, along with internal_api's SELECT on each. public_api
-- has no grant on the schema, so it can never read a draft through it.
CREATE SCHEMA preview;--> statement-breakpoint
GRANT USAGE ON SCHEMA preview TO internal_api;--> statement-breakpoint
-- Explicit per-table grants, with no ALTER DEFAULT PRIVILEGES, so a table a later migration adds
-- gets no access until that migration grants it deliberately. public_api has none in public.
GRANT SELECT ON
  app_user, area, area_relationship, area_type, ci_method, classification, comparator_method,
  data_provider, data_provider_source, data_source, dimension_type, dimension_value, note_type,
  subtopic, team, unit, value_type, current_published_version
TO internal_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  indicator, indicator_version, indicator_version_age_range, indicator_version_classification,
  indicator_version_source, indicator_version_subtopic, indicator_version_topic, observation,
  observation_dimension, observation_note, topic, upload_batch
TO internal_api;--> statement-breakpoint
-- Review history is never edited or removed: responses and the audit log are append-only.
GRANT SELECT, INSERT ON audit_log, indicator_version_submission_response TO internal_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON
  indicator_version_review_note, indicator_version_submission, indicator_version_submission_flag
TO internal_api;--> statement-breakpoint
-- Publishing refreshes one indicator's read-model rows by deleting and inserting them, never
-- updating or truncating.
GRANT SELECT, INSERT, DELETE ON
  available_data, observation_range, observation_series, observation_series_batch,
  indicator_version_submission_reviewer
TO internal_api;--> statement-breakpoint
-- The short id sequence belongs to the column it numbers, so dropping the column drops it too.
ALTER SEQUENCE "public"."indicator_short_id_seq" OWNED BY "public"."indicator"."short_id";--> statement-breakpoint
GRANT USAGE ON SEQUENCE indicator_short_id_seq TO internal_api;--> statement-breakpoint
-- The system users that imports, the seed and scheduled publication write as. The ids are fixed
-- because SYSTEM_USER_IDS in @fphd/db names them.
INSERT INTO "app_user" ("id", "display_name", "kind") VALUES
  ('01a13c69-96ab-7598-9ce0-f0c3bd77bded', 'PHOLIO migration', 'system'),
  ('01a13c69-96ab-7598-9ce0-f5fa1e68080a', 'Test seed', 'system'),
  ('01a154fb-1a99-7705-9016-05db53119b93', 'Core data import', 'system'),
  ('01a1ad2e-22f2-7894-b161-c39055b37600', 'Scheduled publication', 'system');--> statement-breakpoint
-- Imported indicators belong to the Fingertips team, which has no members. The id is fixed because
-- TEAM_IDS in @fphd/auth names it.
INSERT INTO "team" ("id", "name") VALUES
  ('01a13ca4-5b80-76ba-bda8-93cbb4a49f64', 'Fingertips');
