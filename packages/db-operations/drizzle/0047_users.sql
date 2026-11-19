CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"display_name" text NOT NULL,
	"kind" text NOT NULL,
	"oidc_issuer" text,
	"oidc_subject" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_oidc_identity_unique" UNIQUE("oidc_issuer","oidc_subject"),
	CONSTRAINT "app_user_kind_check" CHECK ("app_user"."kind" IN ('person', 'system')),
	CONSTRAINT "app_user_oidc_identity_check" CHECK (("app_user"."oidc_issuer" IS NULL) = ("app_user"."oidc_subject" IS NULL)),
	CONSTRAINT "app_user_system_identity_check" CHECK ("app_user"."kind" <> 'system' OR "app_user"."oidc_issuer" IS NULL)
);
--> statement-breakpoint
-- The ids are fixed: @fphd/auth signs the fake people in by them, and SYSTEM_USER_IDS names the
-- system users imports write as. The fake people stand in until people sign in through Entra.
INSERT INTO "app_user" ("id", "display_name", "kind") VALUES
  ('01a13c69-96ab-7598-9ce0-f0c3bd77bded', 'PHOLIO migration', 'system'),
  ('01a13c69-96ab-7598-9ce0-f5fa1e68080a', 'Test seed', 'system'),
  ('01a13c69-96ac-700c-9c28-8f3a1d3968e2', 'Alex Morgan', 'person'),
  ('01a13c69-96ab-7598-9ce0-f84dbec3d5dd', 'Sam Taylor', 'person'),
  ('01a13c69-96ab-7598-9ce0-fc3b3433f586', 'Jordan Lee', 'person'),
  ('01a13c69-96ab-7598-9ce1-00c3f4e7a399', 'Casey Patel', 'person'),
  ('01a13c69-96ab-7598-9ce1-0437fbc8b7ec', 'Morgan Hughes', 'person'),
  ('01a13c69-96ab-7598-9ce1-0a29866e38c2', 'Avery Clarke', 'person'),
  ('01a13c69-96ac-700c-9c28-84ab06327fd0', 'Jamie Evans', 'person'),
  ('01a13c69-96ac-700c-9c28-8a01ee1fdfa8', 'Riley Singh', 'person');--> statement-breakpoint
-- An actor must already be a user's id: a value that is not a uuid stops the migration here, and
-- one no user holds stops it at the foreign keys.
ALTER TABLE "indicator_version"
  ALTER COLUMN "created_by" SET DATA TYPE uuid USING "created_by"::uuid,
  ALTER COLUMN "updated_by" SET DATA TYPE uuid USING "updated_by"::uuid;--> statement-breakpoint
ALTER TABLE "upload_batch"
  ALTER COLUMN "uploaded_by" SET DATA TYPE uuid USING "uploaded_by"::uuid;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_uploaded_by_app_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- An observation's writer is its batch's uploader.
ALTER TABLE "observation" DROP COLUMN "created_by";--> statement-breakpoint
GRANT SELECT ON "app_user" TO internal_api;