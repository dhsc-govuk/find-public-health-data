-- Notes for reviewers: internal_api may read and add responses but never change or delete one,
-- and may read, add and update flags and reviewer notes; public_api gets nothing, as it reads only
-- the published schema. The grants are at the end.
CREATE TABLE "indicator_version_review_note" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"submission_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "indicator_version_review_note_text_check" CHECK ("indicator_version_review_note"."text" <> '')
);
--> statement-breakpoint
CREATE TABLE "indicator_version_submission_flag" (
	"response_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"notes" text NOT NULL,
	"cleared_by" uuid,
	"cleared_at" timestamp with time zone,
	CONSTRAINT "indicator_version_submission_flag_pk" PRIMARY KEY("response_id","task_key"),
	CONSTRAINT "indicator_version_submission_flag_task_key_check" CHECK ("indicator_version_submission_flag"."task_key" IN ('name', 'data-table', 'definition-and-rationale', 'polarity', 'data-quality', 'numerator', 'denominator', 'calculation', 'confidence-intervals', 'update-frequency', 'value-type-and-units', 'period-type', 'other-notes-and-caveats', 'publishing-date', 'links', 'copyright-and-data-reuse', 'benchmarking', 'sex-and-ages', 'tagging')),
	CONSTRAINT "indicator_version_submission_flag_notes_check" CHECK ("indicator_version_submission_flag"."notes" <> ''),
	CONSTRAINT "indicator_version_submission_flag_cleared_check" CHECK (("indicator_version_submission_flag"."cleared_by" IS NULL) = ("indicator_version_submission_flag"."cleared_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "indicator_version_submission_response" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"imrg_reviewed_on" date,
	"clarification_request" text,
	"responded_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "indicator_version_submission_response_kind_check" CHECK ("indicator_version_submission_response"."kind" IN ('pre_imrg_feedback', 'minor_revisions', 'major_revisions', 'approved')),
	CONSTRAINT "indicator_version_submission_response_imrg_reviewed_on_check" CHECK (("indicator_version_submission_response"."imrg_reviewed_on" IS NULL) = ("indicator_version_submission_response"."kind" = 'pre_imrg_feedback')),
	CONSTRAINT "indicator_version_submission_response_clarification_check" CHECK ("indicator_version_submission_response"."clarification_request" IS NULL OR ("indicator_version_submission_response"."kind" <> 'approved' AND "indicator_version_submission_response"."clarification_request" <> ''))
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_check";--> statement-breakpoint
ALTER TABLE "indicator_version_submission" DROP CONSTRAINT "indicator_version_submission_status_check";--> statement-breakpoint
ALTER TABLE "indicator_version_submission" DROP CONSTRAINT "indicator_version_submission_ended_check";--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD COLUMN "revision_response" text;--> statement-breakpoint
ALTER TABLE "indicator_version_review_note" ADD CONSTRAINT "indicator_version_review_note_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."indicator_version_submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_review_note" ADD CONSTRAINT "indicator_version_review_note_author_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" ADD CONSTRAINT "indicator_version_submission_flag_response_fk" FOREIGN KEY ("response_id") REFERENCES "public"."indicator_version_submission_response"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_flag" ADD CONSTRAINT "indicator_version_submission_flag_cleared_by_fk" FOREIGN KEY ("cleared_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_response" ADD CONSTRAINT "indicator_version_submission_response_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."indicator_version_submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_submission_response" ADD CONSTRAINT "indicator_version_submission_response_reviewer_fk" FOREIGN KEY ("submission_id","reviewer_id") REFERENCES "public"."indicator_version_submission_reviewer"("submission_id","reviewer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_indicator_version_review_note_submission_id_created_at" ON "indicator_version_review_note" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_indicator_version_submission_response_submission_id" ON "indicator_version_submission_response" USING btree ("submission_id");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" IN ('topic.created', 'topic.updated', 'topic.deleted', 'indicator.draft_created', 'indicator.draft_updated', 'indicator.draft_created_from_published', 'indicator.data_table_confirmed', 'indicator.submitted', 'indicator.submission_withdrawn', 'indicator.reviewers_assigned', 'indicator.review_feedback_given', 'indicator.changes_requested', 'indicator.approved', 'indicator.resubmitted', 'indicator.revision_response_updated', 'indicator.review_note_added', 'indicator.review_note_updated', 'upload_batch.loaded', 'upload_batch.refused', 'upload_batch.deleted', 'data_migration.applied', 'subtopic.created', 'subtopic.updated', 'ci_method.created', 'ci_method.updated', 'classification.created', 'classification.updated', 'data_provider.created', 'data_provider.updated', 'data_provider_source.created', 'data_provider_source.updated', 'value_type.created', 'value_type.updated', 'unit.created', 'unit.updated', 'comparator_method.created', 'comparator_method.updated'));--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD CONSTRAINT "indicator_version_submission_status_check" CHECK ("indicator_version_submission"."status" IN ('submitted', 'withdrawn', 'in_review', 'changes_requested', 'approved'));--> statement-breakpoint
ALTER TABLE "indicator_version_submission" ADD CONSTRAINT "indicator_version_submission_ended_check" CHECK (("indicator_version_submission"."status" IN ('withdrawn', 'changes_requested', 'approved')) = ("indicator_version_submission"."ended_by" IS NOT NULL) AND ("indicator_version_submission"."ended_by" IS NULL) = ("indicator_version_submission"."ended_at" IS NULL));--> statement-breakpoint
GRANT SELECT, INSERT ON "indicator_version_submission_response" TO internal_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "indicator_version_submission_flag" TO internal_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "indicator_version_review_note" TO internal_api;
