-- The core data import writes the topics, so the topics it wrote before they named a writer are
-- attributed to it, and so are any an admin wrote: no record says who did.
INSERT INTO "app_user" ("id", "display_name", "kind") VALUES
  ('01a154fb-1a99-7705-9016-05db53119b93', 'Core data import', 'system');--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
UPDATE "topic" SET "created_by" = '01a154fb-1a99-7705-9016-05db53119b93',
  "updated_by" = '01a154fb-1a99-7705-9016-05db53119b93';--> statement-breakpoint
ALTER TABLE "topic" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "topic" ALTER COLUMN "updated_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
