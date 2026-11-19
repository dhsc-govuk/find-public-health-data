ALTER TABLE "indicator_version" ADD COLUMN "ci_method_modified" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "ci_method_modifications" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "ci_method_other_detail" text;--> statement-breakpoint
ALTER TABLE "ci_method" ADD COLUMN "kind" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_method" ADD CONSTRAINT "ci_method_kind_check" CHECK ("ci_method"."kind" IN ('standard', 'other', 'none'));