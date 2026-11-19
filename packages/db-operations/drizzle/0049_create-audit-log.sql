-- Notes for reviewers: internal_api may read and add entries but never change one, so the log is
-- append-only for it. Operations writes as the owner, which keeps every privilege.
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"changes" jsonb NOT NULL,
	"request_id" uuid,
	CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" IN ('topic.created', 'topic.updated', 'topic.deleted', 'indicator.draft_created', 'indicator.draft_updated', 'indicator.draft_created_from_published', 'indicator.data_table_confirmed', 'upload_batch.loaded', 'upload_batch.refused', 'upload_batch.deleted', 'data_migration.applied', 'ci_method.created', 'ci_method.updated', 'classification.created', 'classification.updated', 'data_provider.created', 'data_provider.updated', 'data_provider_source.created', 'data_provider_source.updated', 'value_type.created', 'value_type.updated', 'unit.created', 'unit.updated', 'comparator_method.created', 'comparator_method.updated')),
	CONSTRAINT "audit_log_entity_type_check" CHECK ("audit_log"."entity_type" = split_part("audit_log"."action", '.', 1)),
	CONSTRAINT "audit_log_changes_check" CHECK (jsonb_typeof("audit_log"."changes") = 'object')
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_log_entity_type_entity_id_occurred_at" ON "audit_log" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_log" TO internal_api;
