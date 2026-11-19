-- The task key check below no longer allows the Links task, so reviewers' flags on it are deleted
-- first. The responses they belong to, and those responses' other flags, stay.
DELETE FROM "indicator_version_submission_flag" WHERE "task_key" = 'links';--> statement-breakpoint
DROP TABLE "indicator_version_link";--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" DROP CONSTRAINT "indicator_version_submission_flag_task_key_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "has_links";--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" ADD CONSTRAINT "indicator_version_submission_flag_task_key_check" CHECK ("indicator_version_submission_flag"."task_key" IN ('name', 'data-table', 'definition-and-rationale', 'polarity', 'data-quality', 'numerator', 'denominator', 'calculation', 'confidence-intervals', 'update-frequency', 'value-type-and-units', 'period-type', 'other-notes-and-caveats', 'publishing-date', 'copyright-and-data-reuse', 'benchmarking', 'sex-and-ages', 'tagging'));
