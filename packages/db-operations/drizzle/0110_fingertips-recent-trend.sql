-- The published views read the columns this migration replaces, so they go first and come back
-- reading the new ones. `db migrate` recreates the preview views from them afterwards.
DROP VIEW published.observation_series, published.observation_series_batch;--> statement-breakpoint
ALTER TABLE "observation_series" ADD COLUMN "trend" jsonb;--> statement-breakpoint
ALTER TABLE "observation_series_batch" ADD COLUMN "trend" jsonb;--> statement-breakpoint
ALTER TABLE "observation_series" DROP COLUMN "recent_values";--> statement-breakpoint
ALTER TABLE "observation_series_batch" DROP COLUMN "trend_values";--> statement-breakpoint
CREATE VIEW published.observation_series_batch AS
SELECT b.indicator_id, b.trend, b.version FROM observation_series_batch b
JOIN current_published_version cpv ON cpv.indicator_id = b.indicator_id
JOIN indicator_version v ON v.id = cpv.id AND v.upload_batch_id = b.upload_batch_id;
--> statement-breakpoint
CREATE VIEW published.observation_series AS
SELECT s.indicator_id, s.area_id, s.dimension_key, s.sex, s.period_type,
       s.variants, s.latest_observation_id, s.ranking_observation_id, s.recent_observation_ids,
       s.trend, s.sparkline_observation_ids
FROM observation_series s
JOIN current_published_version cpv ON cpv.indicator_id = s.indicator_id
JOIN indicator_version v ON v.id = cpv.id AND v.upload_batch_id = s.upload_batch_id;
--> statement-breakpoint
GRANT SELECT ON published.observation_series, published.observation_series_batch TO public_api, internal_api;
