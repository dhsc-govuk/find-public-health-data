-- The update summaries: no published view reads them yet, and internal_api writes them under its
-- table-level grant on indicator_version.
ALTER TABLE "indicator_version" ADD COLUMN "update_summary" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "update_summary_for_reviewers" text;
