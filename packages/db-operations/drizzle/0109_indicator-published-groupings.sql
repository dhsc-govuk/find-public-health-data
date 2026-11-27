CREATE TABLE "indicator_grouping" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"sex_id" uuid,
	"age_id" uuid,
	"year_range" integer NOT NULL,
	"period_kind" text NOT NULL,
	CONSTRAINT "indicator_grouping_tuple" UNIQUE NULLS NOT DISTINCT("indicator_id","sex_id","age_id","year_range","period_kind"),
	CONSTRAINT "indicator_grouping_period_kind_check" CHECK ("indicator_grouping"."period_kind" IN ('annual', 'quarterly', 'monthly'))
);
--> statement-breakpoint
ALTER TABLE "indicator_grouping" ADD CONSTRAINT "indicator_grouping_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_grouping" ADD CONSTRAINT "indicator_grouping_sex_id_dimension_value_id_fk" FOREIGN KEY ("sex_id") REFERENCES "public"."dimension_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_grouping" ADD CONSTRAINT "indicator_grouping_age_id_dimension_value_id_fk" FOREIGN KEY ("age_id") REFERENCES "public"."dimension_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_indicator_grouping_indicator" ON "indicator_grouping" USING btree ("indicator_id");--> statement-breakpoint
CREATE VIEW "published"."indicator_grouping" AS (SELECT g.* FROM public.indicator_grouping g
        WHERE g.indicator_id IN (SELECT id FROM "published".indicator));
--> statement-breakpoint
GRANT SELECT ON published.indicator_grouping TO public_api, internal_api;
