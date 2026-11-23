CREATE TABLE "dimension_value_age_range" (
	"id" uuid PRIMARY KEY NOT NULL,
	"age_from_value" smallint NOT NULL,
	"age_from_unit" text NOT NULL,
	"age_under_value" smallint,
	"age_under_unit" text,
	CONSTRAINT "dimension_value_age_range_age_from_unit_check" CHECK ("dimension_value_age_range"."age_from_unit" IN ('year', 'month', 'week', 'day')),
	CONSTRAINT "dimension_value_age_range_age_under_check" CHECK (("dimension_value_age_range"."age_under_value" IS NULL) = ("dimension_value_age_range"."age_under_unit" IS NULL) AND "dimension_value_age_range"."age_under_unit" IN ('year', 'month', 'week', 'day'))
);
--> statement-breakpoint
ALTER TABLE "dimension_value_age_range" ADD CONSTRAINT "dimension_value_age_range_id_dimension_value_id_fk" FOREIGN KEY ("id") REFERENCES "public"."dimension_value"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE VIEW published.dimension_value_age_range AS SELECT * FROM dimension_value_age_range;--> statement-breakpoint
GRANT SELECT ON published.dimension_value_age_range TO public_api, internal_api;--> statement-breakpoint
-- The internal role refreshes read models, whose headline rule reads the age ranges.
GRANT SELECT ON dimension_value_age_range TO internal_api;
