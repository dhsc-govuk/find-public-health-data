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
ALTER TABLE "indicator_version" ADD COLUMN "sexes" text[];--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "age_type" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "specific_age" smallint;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "specific_age_unit" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "age_other_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version_age_range" ADD CONSTRAINT "indicator_version_age_range_indicator_version_id_indicator_version_id_fk" FOREIGN KEY ("indicator_version_id") REFERENCES "public"."indicator_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_sexes_check" CHECK ("indicator_version"."sexes" <@ ARRAY['persons', 'females', 'males']::text[] AND cardinality("indicator_version"."sexes") > 0);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_age_type_check" CHECK ("indicator_version"."age_type" IN ('all', 'range', 'specific', 'other'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_specific_age_unit_check" CHECK ("indicator_version"."specific_age_unit" IN ('days', 'weeks', 'months', 'years'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_specific_age_check" CHECK ("indicator_version"."specific_age" BETWEEN 0 AND 999);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_specific_age_pair_check" CHECK (("indicator_version"."specific_age" IS NULL) = ("indicator_version"."specific_age_unit" IS NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_specific_age_type_check" CHECK ("indicator_version"."age_type" IS NOT DISTINCT FROM 'specific' OR "indicator_version"."specific_age" IS NULL);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_age_other_detail_check" CHECK ("indicator_version"."age_type" IS NOT DISTINCT FROM 'other' OR "indicator_version"."age_other_detail" IS NULL);--> statement-breakpoint
-- Written by the publisher, and the whole table as the other write grants are; no published view reads it.
GRANT SELECT, INSERT, UPDATE, DELETE ON indicator_version_age_range TO internal_api;
