-- No published view reads the goal yet, and internal_api writes it under its table-level grant
-- on indicator_version. Existing versions stay unanswered: the seed carries no legacy goals.
ALTER TABLE "indicator_version" ADD COLUMN "has_goal_benchmark" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "goal_lower_value" double precision;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "goal_upper_value" double precision;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "goal_polarity" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "goal_policy_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_goal_polarity_check" CHECK ("indicator_version"."goal_polarity" IN ('higher-is-better', 'lower-is-better'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_goal_check" CHECK (("indicator_version"."has_goal_benchmark" IS TRUE) = ("indicator_version"."goal_lower_value" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_goal_pair_check" CHECK (("indicator_version"."goal_lower_value" IS NULL) = ("indicator_version"."goal_polarity" IS NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_goal_upper_value_check" CHECK ("indicator_version"."goal_upper_value" IS NULL OR ("indicator_version"."goal_lower_value" IS NOT NULL AND "indicator_version"."goal_upper_value" > "indicator_version"."goal_lower_value"));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_goal_policy_detail_check" CHECK ("indicator_version"."has_goal_benchmark" IS TRUE OR "indicator_version"."goal_policy_detail" IS NULL);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_goal_values_check" CHECK ("indicator_version"."goal_lower_value" > '-Infinity' AND "indicator_version"."goal_lower_value" < 'Infinity' AND "indicator_version"."goal_upper_value" < 'Infinity');