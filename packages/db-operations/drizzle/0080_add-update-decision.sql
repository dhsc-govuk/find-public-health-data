-- The core team's decision on a submitted update. No published view reads submissions, and
-- internal_api writes it under its table-level grant on indicator_version_submission.
ALTER TABLE "indicator_version_submission" ADD COLUMN "update_decision" text;--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD CONSTRAINT "indicator_version_submission_update_decision_check" CHECK ("indicator_version_submission"."update_decision" IN ('imrg_review', 'request_revisions', 'publish_with_history', 'publish_without_history'));
