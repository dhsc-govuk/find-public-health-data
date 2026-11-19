-- What a submitted update changed, kept with its submission for the History tab. No published
-- view reads submissions, and internal_api writes it under its table-level grant on
-- indicator_version_submission.
ALTER TABLE "indicator_version_submission" ADD COLUMN "update_changes" jsonb;--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD CONSTRAINT "indicator_version_submission_update_changes_check" CHECK (jsonb_typeof("indicator_version_submission"."update_changes") = 'array');
