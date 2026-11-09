ALTER TABLE "observation_series_batch" ADD COLUMN "trend_values" double precision[];
--> statement-breakpoint
CREATE OR REPLACE VIEW published.observation_series_batch AS
SELECT b.indicator_id, b.trend_values FROM observation_series_batch b
JOIN current_published_version cpv ON cpv.indicator_id = b.indicator_id
JOIN indicator_version v ON v.id = cpv.id AND v.upload_batch_id = b.upload_batch_id;
--> statement-breakpoint
WITH points AS MATERIALIZED (
 SELECT o.indicator_id, o.from_date, o.to_date, o.value, o.dimension_key AS segment
 FROM published.observation o
 WHERE o.area_id = ANY (ARRAY(SELECT id FROM area WHERE code = 'E92000001'))
), chosen AS (
 SELECT DISTINCT ON (indicator_id) indicator_id, segment
 FROM points GROUP BY indicator_id, segment
 ORDER BY indicator_id, cardinality(string_to_array(segment, ',')), count(value) DESC, segment
), trends AS (
 SELECT s.indicator_id,
   coalesce((array_agg(p.value ORDER BY p.from_date DESC, p.to_date DESC)
     FILTER (WHERE p.value IS NOT NULL))[1:5], '{}'::double precision[]) AS values
 FROM chosen s JOIN points p ON p.indicator_id = s.indicator_id AND p.segment = s.segment
 GROUP BY s.indicator_id
)
UPDATE observation_series_batch b SET trend_values = t.values
FROM trends t, current_published_version cpv JOIN indicator_version v ON v.id = cpv.id
WHERE b.indicator_id = t.indicator_id AND cpv.indicator_id = b.indicator_id
  AND b.upload_batch_id = v.upload_batch_id;
