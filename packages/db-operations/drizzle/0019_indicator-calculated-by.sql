ALTER TABLE "indicator_version" ADD COLUMN "calculated_by" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "calculated_by_other" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_calculated_by_check" CHECK ("indicator_version"."calculated_by" IN ('ohid', 'dhsc', 'other'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_calculated_by_other_check" CHECK ("indicator_version"."calculated_by" IS NOT DISTINCT FROM 'other' OR "indicator_version"."calculated_by_other" IS NULL);