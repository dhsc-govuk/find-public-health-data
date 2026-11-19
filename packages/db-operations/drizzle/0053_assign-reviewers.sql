-- Notes for reviewers: internal_api may read, add and remove reviewer assignments but not change
-- one; public_api gets nothing, as it reads only the published schema. The grant is at the end.
CREATE TABLE "indicator_version_submission_reviewer" (
	"submission_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "indicator_version_submission_reviewer_pk" PRIMARY KEY("submission_id","reviewer_id")
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_check";--> statement-breakpoint
ALTER TABLE "indicator_version_submission" DROP CONSTRAINT "indicator_version_submission_status_check";--> statement-breakpoint
ALTER TABLE "indicator_version_submission_reviewer" ADD CONSTRAINT "indicator_version_submission_reviewer_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."indicator_version_submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_reviewer" ADD CONSTRAINT "indicator_version_submission_reviewer_reviewer_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_reviewer" ADD CONSTRAINT "indicator_version_submission_reviewer_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_indicator_version_submission_reviewer_reviewer_id" ON "indicator_version_submission_reviewer" USING btree ("reviewer_id");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" IN ('topic.created', 'topic.updated', 'topic.deleted', 'indicator.draft_created', 'indicator.draft_updated', 'indicator.draft_created_from_published', 'indicator.data_table_confirmed', 'indicator.submitted', 'indicator.submission_withdrawn', 'indicator.reviewers_assigned', 'upload_batch.loaded', 'upload_batch.refused', 'upload_batch.deleted', 'data_migration.applied', 'subtopic.created', 'subtopic.updated', 'ci_method.created', 'ci_method.updated', 'classification.created', 'classification.updated', 'data_provider.created', 'data_provider.updated', 'data_provider_source.created', 'data_provider_source.updated', 'value_type.created', 'value_type.updated', 'unit.created', 'unit.updated', 'comparator_method.created', 'comparator_method.updated'));--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD CONSTRAINT "indicator_version_submission_status_check" CHECK ("indicator_version_submission"."status" IN ('submitted', 'withdrawn', 'in_review'));--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "indicator_version_submission_reviewer" TO internal_api;
