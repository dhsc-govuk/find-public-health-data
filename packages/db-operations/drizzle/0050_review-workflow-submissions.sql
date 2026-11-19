-- Notes for reviewers: internal_api may read, add and update submissions but never delete one;
-- public_api gets nothing, as it reads only the published schema. The grant is at the end.
CREATE TABLE "indicator_version_submission" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_version_id" uuid NOT NULL,
	"indicator_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"ended_by" uuid,
	"ended_at" timestamp with time zone,
	CONSTRAINT "indicator_version_submission_status_check" CHECK ("indicator_version_submission"."status" IN ('submitted', 'withdrawn')),
	CONSTRAINT "indicator_version_submission_number_check" CHECK ("indicator_version_submission"."number" > 0),
	CONSTRAINT "indicator_version_submission_ended_check" CHECK (("indicator_version_submission"."status" IN ('withdrawn')) = ("indicator_version_submission"."ended_by" IS NOT NULL) AND ("indicator_version_submission"."ended_by" IS NULL) = ("indicator_version_submission"."ended_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_check";--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "is_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD CONSTRAINT "indicator_version_submission_version_fk" FOREIGN KEY ("indicator_version_id","indicator_id") REFERENCES "public"."indicator_version"("id","indicator_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD CONSTRAINT "indicator_version_submission_submitted_by_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD CONSTRAINT "indicator_version_submission_ended_by_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_indicator_version_submission_indicator_version_id_number" ON "indicator_version_submission" USING btree ("indicator_version_id","number");--> statement-breakpoint
CREATE INDEX "idx_indicator_version_submission_indicator_id_submitted_at" ON "indicator_version_submission" USING btree ("indicator_id","submitted_at");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" IN ('topic.created', 'topic.updated', 'topic.deleted', 'indicator.draft_created', 'indicator.draft_updated', 'indicator.draft_created_from_published', 'indicator.data_table_confirmed', 'indicator.submitted', 'indicator.submission_withdrawn', 'upload_batch.loaded', 'upload_batch.refused', 'upload_batch.deleted', 'data_migration.applied', 'ci_method.created', 'ci_method.updated', 'classification.created', 'classification.updated', 'data_provider.created', 'data_provider.updated', 'data_provider_source.created', 'data_provider_source.updated', 'value_type.created', 'value_type.updated', 'unit.created', 'unit.updated', 'comparator_method.created', 'comparator_method.updated'));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "indicator_version_submission" TO internal_api;
