CREATE TABLE "area_level" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"hierarchy" text,
	"display_order" integer NOT NULL,
	"parent_levels" text[] NOT NULL,
	"area_type_ids" uuid[] NOT NULL,
	CONSTRAINT "area_level_slug_unique" UNIQUE("slug"),
	CONSTRAINT "area_level_hierarchy_check" CHECK ("area_level"."hierarchy" IN ('administrative', 'nhs'))
);
--> statement-breakpoint
CREATE VIEW published.area_level AS SELECT * FROM area_level;--> statement-breakpoint
GRANT SELECT ON published.area_level TO public_api, internal_api;
