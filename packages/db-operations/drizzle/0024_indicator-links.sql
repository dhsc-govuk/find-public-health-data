CREATE TABLE "indicator_version_link" (
	"indicator_version_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"url" text NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "indicator_version_link_indicator_version_id_position_pk" PRIMARY KEY("indicator_version_id","position"),
	CONSTRAINT "indicator_version_link_position_check" CHECK ("indicator_version_link"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "has_links" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version_link" ADD CONSTRAINT "indicator_version_link_indicator_version_id_indicator_version_id_fk" FOREIGN KEY ("indicator_version_id") REFERENCES "public"."indicator_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Written by the publisher, and the whole table as the other write grants are; no published view reads it.
GRANT SELECT, INSERT, UPDATE, DELETE ON indicator_version_link TO internal_api;
