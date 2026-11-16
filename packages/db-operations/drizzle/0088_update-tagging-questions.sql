-- Drops the area context answer and the primary flags on topic and subtopic placements, and
-- adds the PHOF indicator number, the risk factor dimension and the classifications' order. The
-- two published placement views read the primary flags, so they are dropped first and rebuilt
-- without them.
DROP VIEW published.indicator_topic;--> statement-breakpoint
DROP VIEW published.indicator_subtopic;--> statement-breakpoint
ALTER TABLE "classification" DROP CONSTRAINT "classification_dimension_check";--> statement-breakpoint
DROP INDEX "idx_indicator_version_subtopic_primary";--> statement-breakpoint
DROP INDEX "idx_indicator_version_topic_primary";--> statement-breakpoint
-- Every row takes the first position until import-core-data gives each its own.
ALTER TABLE "classification" ADD COLUMN "position" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "classification" ALTER COLUMN "position" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "phof_indicator_number" text;--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "is_area_context";--> statement-breakpoint
ALTER TABLE "indicator_version_subtopic" DROP COLUMN "is_primary";--> statement-breakpoint
ALTER TABLE "indicator_version_topic" DROP COLUMN "is_primary";--> statement-breakpoint
ALTER TABLE "classification" ADD CONSTRAINT "classification_dimension_check" CHECK ("classification"."dimension" IN ('indicator_type', 'population', 'inequality', 'framework', 'life_stage', 'risk_factor'));--> statement-breakpoint
CREATE VIEW published.indicator_topic AS
SELECT cpv.indicator_id, t.topic_id
FROM indicator_version_topic t
JOIN current_published_version cpv ON cpv.id = t.indicator_version_id;--> statement-breakpoint
CREATE VIEW published.indicator_subtopic AS
SELECT cpv.indicator_id, s.topic_id, s.subtopic_id
FROM indicator_version_subtopic s
JOIN current_published_version cpv ON cpv.id = s.indicator_version_id;--> statement-breakpoint
GRANT SELECT ON published.indicator_topic, published.indicator_subtopic TO public_api, internal_api;
