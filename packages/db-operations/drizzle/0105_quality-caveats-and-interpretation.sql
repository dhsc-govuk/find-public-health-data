ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_rounding_detail_check";--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" DROP CONSTRAINT "indicator_version_submission_flag_task_key_check";--> statement-breakpoint
-- The Data quality task joins Quality, caveats and interpretation. Reviewers' flags on it are
-- deleted rather than moved, as the databases holding any are reset.
DELETE FROM "indicator_version_submission_flag" WHERE "task_key" = 'data-quality';--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "has_rounding";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "rounding_detail";--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_data_quality_caveats_check" CHECK ("indicator_version"."has_data_quality_issues" IS NOT TRUE OR "indicator_version"."has_caveats" IS NOT FALSE);--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" ADD CONSTRAINT "indicator_version_submission_flag_task_key_check" CHECK ("indicator_version_submission_flag"."task_key" IN ('name', 'data-table', 'definition-and-rationale', 'polarity', 'format-and-sources', 'calculation', 'confidence-intervals', 'update-frequency', 'value-type-and-units', 'period-type', 'other-notes-and-caveats', 'publishing-date', 'benchmarking', 'sex-gender-and-ethnicity', 'ages', 'tagging', 'update-summary'));