ALTER TABLE "observation_series" ADD COLUMN "sparkline_observation_ids" uuid[];--> statement-breakpoint
CREATE OR REPLACE VIEW published.observation_series AS
SELECT s.indicator_id, s.area_id, s.dimension_key, s.sex, s.period_type,
       s.variants, s.latest_observation_id, s.ranking_observation_id, s.recent_observation_ids,
       s.recent_values, s.sparkline_observation_ids
FROM observation_series s
JOIN current_published_version cpv ON cpv.indicator_id = s.indicator_id
JOIN indicator_version v ON v.id = cpv.id AND v.upload_batch_id = s.upload_batch_id;
