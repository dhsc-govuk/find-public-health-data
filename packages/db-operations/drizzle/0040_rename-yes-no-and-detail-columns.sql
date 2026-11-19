-- Yes/no answers are has_<subject> and the text beside one <subject>_detail; the text beside an
-- "other" choice is <question>_detail. Checks follow a renamed column.
ALTER TABLE "indicator_version" RENAME COLUMN "unit_other" TO "unit_detail";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "ci_method_modified" TO "has_ci_method_modifications";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "ci_method_modifications" TO "ci_method_modifications_detail";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "ci_method_other_detail" TO "ci_method_detail";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "calculated_by_other" TO "calculated_by_detail";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "age_other_detail" TO "age_detail";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "rounding_applied" TO "has_rounding";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "caveats_needed" TO "has_caveats";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "other_notes_needed" TO "has_other_notes";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "data_quality_issues" TO "has_data_quality_issues";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "copyright_non_default" TO "has_custom_copyright";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "copyright_detail" TO "custom_copyright_detail";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "data_reuse_non_default" TO "has_custom_data_reuse";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "data_reuse_detail" TO "custom_data_reuse_detail";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "source_data_issues" TO "has_source_data_issues";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "automation_used" TO "has_automation";--> statement-breakpoint
-- A view keeps its own column names, so the public one is renamed to match; its grants stay.
ALTER VIEW published.indicator RENAME COLUMN "unit_other" TO "unit_detail";
