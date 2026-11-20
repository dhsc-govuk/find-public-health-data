CREATE TABLE "deprivation_scheme" (
	"id" uuid PRIMARY KEY NOT NULL,
	"release" text NOT NULL,
	"ranked" text NOT NULL,
	"within" text NOT NULL,
	"boundaries" text,
	"groups" smallint NOT NULL,
	CONSTRAINT "deprivation_scheme_within_check" CHECK ("deprivation_scheme"."within" IN ('england', 'area')),
	CONSTRAINT "deprivation_scheme_groups_check" CHECK ("deprivation_scheme"."groups" IN (5, 10))
);
--> statement-breakpoint
CREATE TABLE "dimension_type_public" (
	"id" uuid PRIMARY KEY NOT NULL,
	"standard_dimension" text,
	"slug" text,
	CONSTRAINT "dimension_type_public_standard_dimension_check" CHECK ("dimension_type_public"."standard_dimension" IN ('sex', 'age', 'deprivation', 'ethnicity', 'socioeconomic-group', 'religion', 'sexuality'))
);
--> statement-breakpoint
CREATE TABLE "dimension_value_public" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"age_from_value" smallint,
	"age_from_unit" text,
	"age_under_value" smallint,
	"age_under_unit" text,
	"deprivation_group" smallint,
	CONSTRAINT "dimension_value_public_age_from_check" CHECK (("dimension_value_public"."age_from_value" IS NULL) = ("dimension_value_public"."age_from_unit" IS NULL) AND "dimension_value_public"."age_from_unit" IN ('year', 'month', 'week', 'day')),
	CONSTRAINT "dimension_value_public_age_under_check" CHECK (("dimension_value_public"."age_under_value" IS NULL) = ("dimension_value_public"."age_under_unit" IS NULL) AND "dimension_value_public"."age_under_unit" IN ('year', 'month', 'week', 'day')),
	CONSTRAINT "dimension_value_public_deprivation_group_check" CHECK ("dimension_value_public"."deprivation_group" BETWEEN 1 AND 10)
);
--> statement-breakpoint
ALTER TABLE "deprivation_scheme" ADD CONSTRAINT "deprivation_scheme_id_dimension_type_id_fk" FOREIGN KEY ("id") REFERENCES "public"."dimension_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_type_public" ADD CONSTRAINT "dimension_type_public_id_dimension_type_id_fk" FOREIGN KEY ("id") REFERENCES "public"."dimension_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_value_public" ADD CONSTRAINT "dimension_value_public_id_dimension_value_id_fk" FOREIGN KEY ("id") REFERENCES "public"."dimension_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE VIEW published.dimension_type_public AS SELECT * FROM dimension_type_public;--> statement-breakpoint
GRANT SELECT ON published.dimension_type_public TO public_api, internal_api;--> statement-breakpoint
CREATE VIEW published.dimension_value_public AS SELECT * FROM dimension_value_public;--> statement-breakpoint
GRANT SELECT ON published.dimension_value_public TO public_api, internal_api;--> statement-breakpoint
CREATE VIEW published.deprivation_scheme AS SELECT * FROM deprivation_scheme;--> statement-breakpoint
GRANT SELECT ON published.deprivation_scheme TO public_api, internal_api;
