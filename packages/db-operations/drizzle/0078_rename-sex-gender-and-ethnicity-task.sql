ALTER TABLE "indicator_version_submission_flag" DROP CONSTRAINT "indicator_version_submission_flag_task_key_check";--> statement-breakpoint
-- The Sex, gender and ethnicity task's key changes from sex-and-ages to sex-gender-and-ethnicity.
-- Reviewers' flags on the task move to the new key, so they stay on the task they were made on.
UPDATE "indicator_version_submission_flag" SET "task_key" = 'sex-gender-and-ethnicity' WHERE "task_key" = 'sex-and-ages';--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" ADD CONSTRAINT "indicator_version_submission_flag_task_key_check" CHECK ("indicator_version_submission_flag"."task_key" IN ('name', 'data-table', 'definition-and-rationale', 'polarity', 'data-quality', 'numerator', 'denominator', 'calculation', 'confidence-intervals', 'update-frequency', 'value-type-and-units', 'period-type', 'other-notes-and-caveats', 'publishing-date', 'copyright-and-data-reuse', 'benchmarking', 'sex-gender-and-ethnicity', 'ages', 'tagging'));
