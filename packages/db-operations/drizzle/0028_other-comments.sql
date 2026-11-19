-- Notes for reviewers: no published view reads them, and internal_api writes them under its
-- table-level grant on indicator_version.
ALTER TABLE "indicator_version" ADD COLUMN "sponsors_and_stakeholders" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "has_reviewer_comments" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "reviewer_comments_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_reviewer_comments_detail_check" CHECK ("indicator_version"."has_reviewer_comments" IS TRUE OR "indicator_version"."reviewer_comments_detail" IS NULL);