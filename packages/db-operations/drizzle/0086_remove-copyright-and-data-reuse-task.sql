-- The task key check below no longer allows the Copyright and data re-use task, so reviewers'
-- flags on it are deleted first. The responses they belong to, and those responses' other flags,
-- stay.
DELETE FROM "indicator_version_submission_flag" WHERE "task_key" = 'copyright-and-data-reuse';--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_custom_copyright_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_custom_data_reuse_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" DROP CONSTRAINT "indicator_version_submission_flag_task_key_check";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "has_custom_copyright";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "custom_copyright_detail";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "has_custom_data_reuse";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "custom_data_reuse_detail";--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" ADD CONSTRAINT "indicator_version_submission_flag_task_key_check" CHECK ("indicator_version_submission_flag"."task_key" IN ('name', 'data-table', 'definition-and-rationale', 'polarity', 'data-quality', 'numerator', 'denominator', 'calculation', 'confidence-intervals', 'update-frequency', 'value-type-and-units', 'period-type', 'other-notes-and-caveats', 'publishing-date', 'benchmarking', 'sex-gender-and-ethnicity', 'ages', 'tagging', 'update-summary'));
