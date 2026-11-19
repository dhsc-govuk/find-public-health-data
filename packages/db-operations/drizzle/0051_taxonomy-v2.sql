CREATE TABLE "indicator_version_subtopic" (
	"indicator_version_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"subtopic_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "indicator_version_subtopic_pk" PRIMARY KEY("indicator_version_id","subtopic_id")
);
--> statement-breakpoint
CREATE TABLE "subtopic" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"topic_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subtopic_topic_slug_unique" UNIQUE("topic_id","slug"),
	CONSTRAINT "subtopic_id_topic_unique" UNIQUE("id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_check";--> statement-breakpoint
ALTER TABLE "classification" DROP CONSTRAINT "classification_dimension_check";--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "has_life_stage" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "is_area_context" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator_version_topic" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator_version_subtopic" ADD CONSTRAINT "indicator_version_subtopic_topic_fk" FOREIGN KEY ("indicator_version_id","topic_id") REFERENCES "public"."indicator_version_topic"("indicator_version_id","topic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_subtopic" ADD CONSTRAINT "indicator_version_subtopic_subtopic_fk" FOREIGN KEY ("subtopic_id","topic_id") REFERENCES "public"."subtopic"("id","topic_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtopic" ADD CONSTRAINT "subtopic_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_indicator_version_subtopic_primary" ON "indicator_version_subtopic" USING btree ("indicator_version_id") WHERE "indicator_version_subtopic"."is_primary";--> statement-breakpoint
CREATE INDEX "idx_indicator_version_subtopic_subtopic" ON "indicator_version_subtopic" USING btree ("subtopic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_indicator_version_topic_primary" ON "indicator_version_topic" USING btree ("indicator_version_id") WHERE "indicator_version_topic"."is_primary";--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" IN ('topic.created', 'topic.updated', 'topic.deleted', 'indicator.draft_created', 'indicator.draft_updated', 'indicator.draft_created_from_published', 'indicator.data_table_confirmed', 'indicator.submitted', 'indicator.submission_withdrawn', 'upload_batch.loaded', 'upload_batch.refused', 'upload_batch.deleted', 'data_migration.applied', 'subtopic.created', 'subtopic.updated', 'ci_method.created', 'ci_method.updated', 'classification.created', 'classification.updated', 'data_provider.created', 'data_provider.updated', 'data_provider_source.created', 'data_provider_source.updated', 'value_type.created', 'value_type.updated', 'unit.created', 'unit.updated', 'comparator_method.created', 'comparator_method.updated'));--> statement-breakpoint
ALTER TABLE "classification" ADD CONSTRAINT "classification_dimension_check" CHECK ("classification"."dimension" IN ('indicator_type', 'population', 'inequality', 'framework', 'life_stage'));
--> statement-breakpoint
CREATE OR REPLACE VIEW published.indicator_topic AS
SELECT cpv.indicator_id, t.topic_id, t.is_primary
FROM indicator_version_topic t
JOIN current_published_version cpv ON cpv.id = t.indicator_version_id;--> statement-breakpoint
CREATE VIEW published.subtopic AS
SELECT id, topic_id, slug, title, created_at, updated_at FROM subtopic;--> statement-breakpoint
CREATE VIEW published.indicator_subtopic AS
SELECT cpv.indicator_id, s.topic_id, s.subtopic_id, s.is_primary
FROM indicator_version_subtopic s
JOIN current_published_version cpv ON cpv.id = s.indicator_version_id;--> statement-breakpoint
GRANT SELECT ON published.subtopic, published.indicator_subtopic TO public_api, internal_api;--> statement-breakpoint
GRANT SELECT ON subtopic TO internal_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON indicator_version_subtopic TO internal_api;
