-- Notes for reviewers: no published view reads them, and internal_api writes them under its
-- table-level grant on indicator_version.
ALTER TABLE "indicator_version" ADD COLUMN "ci_method_justification" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "data_sources_justification" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "inequalities_included" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "has_exclusions" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "exclusions_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "automation_used" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "automation_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_exclusions_detail_check" CHECK ("indicator_version"."has_exclusions" IS TRUE OR "indicator_version"."exclusions_detail" IS NULL);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_automation_detail_check" CHECK ("indicator_version"."automation_used" IS TRUE OR "indicator_version"."automation_detail" IS NULL);