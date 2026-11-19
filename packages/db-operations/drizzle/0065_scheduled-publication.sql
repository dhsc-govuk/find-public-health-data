ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_check";--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" IN ('topic.created', 'topic.updated', 'topic.deleted', 'indicator.draft_created', 'indicator.draft_updated', 'indicator.draft_created_from_published', 'indicator.data_table_confirmed', 'indicator.submitted', 'indicator.submission_withdrawn', 'indicator.reviewers_assigned', 'indicator.review_feedback_given', 'indicator.changes_requested', 'indicator.approved', 'indicator.resubmitted', 'indicator.revision_response_updated', 'indicator.publication_scheduled', 'indicator.publication_date_changed', 'indicator.published', 'indicator.review_note_added', 'indicator.review_note_updated', 'upload_batch.loaded', 'upload_batch.refused', 'upload_batch.deleted'));--> statement-breakpoint
CREATE INDEX "idx_indicator_version_scheduled_publish_at" ON "indicator_version" USING btree ("scheduled_publish_at","id") WHERE "indicator_version"."status" = 'scheduled';--> statement-breakpoint
-- The system user that scheduled publication acts as. The audit entry for each version it
-- publishes names this user as the actor.
INSERT INTO "app_user" ("id", "display_name", "kind") VALUES
  ('01a1ad2e-22f2-7894-b161-c39055b37600', 'Scheduled publication', 'system');--> statement-breakpoint
-- Publishing runs as internal_api. It replaces the published indicator's rows in these two
-- read-model tables, so internal_api needs to insert and delete rows as well as read them.
GRANT INSERT, DELETE ON "available_data", "observation_range" TO internal_api;
