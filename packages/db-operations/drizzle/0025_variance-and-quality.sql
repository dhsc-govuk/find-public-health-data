-- Notes for reviewers: no published view reads them, and internal_api writes them under its
-- table-level grant on indicator_version.
ALTER TABLE "indicator_version" ADD COLUMN "variation" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "quality_assurance" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "source_data_issues" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "source_data_issues_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_source_data_issues_detail_check" CHECK ("indicator_version"."source_data_issues" IS TRUE OR "indicator_version"."source_data_issues_detail" IS NULL);