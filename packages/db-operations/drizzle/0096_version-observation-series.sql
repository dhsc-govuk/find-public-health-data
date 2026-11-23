ALTER TABLE "observation_series_batch" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE OR REPLACE VIEW published.observation_series_batch AS
SELECT b.indicator_id, b.trend_values, b.version FROM observation_series_batch b
JOIN current_published_version cpv ON cpv.indicator_id = b.indicator_id
JOIN indicator_version v ON v.id = cpv.id AND v.upload_batch_id = b.upload_batch_id;
