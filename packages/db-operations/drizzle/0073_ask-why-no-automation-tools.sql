ALTER TABLE "indicator_version" ADD COLUMN "no_automation_reason" text;--> statement-breakpoint
-- A version answered No to automation tools has no reasons why not, which the check below
-- requires. Its answer goes back to unanswered, and the publisher answers again with the reasons.
UPDATE "indicator_version" SET "has_automation" = NULL WHERE "has_automation" IS FALSE;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_no_automation_reason_check" CHECK (("indicator_version"."has_automation" IS FALSE) = ("indicator_version"."no_automation_reason" IS NOT NULL));
