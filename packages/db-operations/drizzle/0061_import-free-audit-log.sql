-- The audit log records changes made through the service, so the core data import and live-data
-- packages no longer write to it. No deployed environment holds a real record yet, so the log is
-- emptied rather than picking out the import entries, and the check drops the actions only the
-- imports wrote.
TRUNCATE "audit_log";--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_check";--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" IN ('topic.created', 'topic.updated', 'topic.deleted', 'indicator.draft_created', 'indicator.draft_updated', 'indicator.draft_created_from_published', 'indicator.data_table_confirmed', 'indicator.submitted', 'indicator.submission_withdrawn', 'indicator.reviewers_assigned', 'indicator.review_feedback_given', 'indicator.changes_requested', 'indicator.approved', 'indicator.resubmitted', 'indicator.revision_response_updated', 'indicator.publication_scheduled', 'indicator.publication_date_changed', 'indicator.review_note_added', 'indicator.review_note_updated', 'upload_batch.loaded', 'upload_batch.refused', 'upload_batch.deleted'));