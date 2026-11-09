CREATE TABLE "observation_series" (
	"upload_batch_id" uuid NOT NULL,
	"indicator_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"dimension_key" text NOT NULL,
	"sex" text NOT NULL,
	"period_type" text NOT NULL,
	"variants" jsonb NOT NULL,
	"latest_observation_id" uuid NOT NULL,
	"ranking_observation_id" uuid,
	"recent_observation_ids" uuid[] NOT NULL,
	"recent_values" double precision[] NOT NULL,
	CONSTRAINT "observation_series_upload_batch_id_area_id_sex_period_type_pk" PRIMARY KEY("upload_batch_id","area_id","sex","period_type")
);
--> statement-breakpoint
CREATE TABLE "observation_series_batch" (
	"upload_batch_id" uuid PRIMARY KEY NOT NULL,
	"indicator_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_observation_series_indicator_area" ON "observation_series" USING btree ("indicator_id","area_id");
--> statement-breakpoint
CREATE VIEW published.observation_series_batch AS
SELECT b.indicator_id FROM observation_series_batch b
JOIN current_published_version cpv ON cpv.indicator_id = b.indicator_id
JOIN indicator_version v ON v.id = cpv.id AND v.upload_batch_id = b.upload_batch_id;
--> statement-breakpoint
CREATE VIEW published.observation_series AS
SELECT s.indicator_id, s.area_id, s.dimension_key, s.sex, s.period_type,
       s.variants, s.latest_observation_id, s.ranking_observation_id, s.recent_observation_ids, s.recent_values
FROM observation_series s
JOIN current_published_version cpv ON cpv.indicator_id = s.indicator_id
JOIN indicator_version v ON v.id = cpv.id AND v.upload_batch_id = s.upload_batch_id;
--> statement-breakpoint
GRANT SELECT ON published.observation_series, published.observation_series_batch TO public_api, internal_api;
--> statement-breakpoint
-- Scheduled publication refreshes the published indicator's read models as internal_api, and
-- these two tables are now part of that refresh.
GRANT SELECT, INSERT, DELETE ON "observation_series", "observation_series_batch" TO internal_api;
--> statement-breakpoint
DO $$
DECLARE selected_indicator uuid;
BEGIN
FOR selected_indicator IN SELECT indicator_id FROM current_published_version LOOP
WITH source_points AS MATERIALIZED (
 SELECT o.id, o.indicator_id, o.area_id, o.dimension_key, o.from_date, o.to_date, o.value
 FROM published.observation o WHERE o.indicator_id = selected_indicator
), sex_values AS MATERIALIZED (
 SELECT dv.id::text AS id, dv.name, dv.sort_order
 FROM dimension_value dv JOIN dimension_type dt ON dt.id = dv.dimension_type_id
 WHERE dt.name = 'Sex'
), segment_stats AS (
 SELECT indicator_id, area_id, dimension_key,
 count(*) filter (where true) as all_length,
 min(from_date::text || ':' || to_date::text) filter (where true) as all_first,
 (array_agg(id order by from_date desc, to_date desc) filter (where true))[1] as all_latest,
 (array_agg(id order by to_date desc, from_date desc) filter (where value is not null and true))[1] as all_ranking,
 (array_agg(id order by from_date desc, to_date desc) filter (where value is not null and true))[1:5] as all_recent_ids,
 (array_agg(value order by from_date desc, to_date desc) filter (where value is not null and true))[1:5] as all_recent_values,
 count(*) filter (where to_date - from_date <= 400) as single_length,
 min(from_date::text || ':' || to_date::text) filter (where to_date - from_date <= 400) as single_first,
 (array_agg(id order by from_date desc, to_date desc) filter (where to_date - from_date <= 400))[1] as single_latest,
 (array_agg(id order by to_date desc, from_date desc) filter (where value is not null and to_date - from_date <= 400))[1] as single_ranking,
 (array_agg(id order by from_date desc, to_date desc) filter (where value is not null and to_date - from_date <= 400))[1:5] as single_recent_ids,
 (array_agg(value order by from_date desc, to_date desc) filter (where value is not null and to_date - from_date <= 400))[1:5] as single_recent_values,
 count(*) filter (where to_date - from_date > 400) as rolling_length,
 min(from_date::text || ':' || to_date::text) filter (where to_date - from_date > 400) as rolling_first,
 (array_agg(id order by from_date desc, to_date desc) filter (where to_date - from_date > 400))[1] as rolling_latest,
 (array_agg(id order by to_date desc, from_date desc) filter (where value is not null and to_date - from_date > 400))[1] as rolling_ranking,
 (array_agg(id order by from_date desc, to_date desc) filter (where value is not null and to_date - from_date > 400))[1:5] as rolling_recent_ids,
 (array_agg(value order by from_date desc, to_date desc) filter (where value is not null and to_date - from_date > 400))[1:5] as rolling_recent_values
 FROM source_points GROUP BY indicator_id, area_id, dimension_key
), segments AS MATERIALIZED (
 SELECT s.*, coalesce((SELECT id FROM sex_values WHERE position(id in s.dimension_key) > 0 LIMIT 1), '') AS sex
 FROM segment_stats s
), area_metadata AS (
 SELECT indicator_id, area_id, bool_or(sex = '') AS aggregate,
   bool_or(single_length > 0) AS single, bool_or(rolling_length > 0) AS rolling
 FROM segments GROUP BY indicator_id, area_id
), variant_choices AS (
 SELECT indicator_id, area_id, '' AS sex, 'all' AS period_type, 0 AS sex_order, '' AS sex_name, 0 AS period_order
 FROM area_metadata WHERE aggregate
 UNION ALL
 SELECT DISTINCT m.indicator_id, m.area_id, v.name,
   CASE WHEN m.single AND m.rolling THEN p.period_type ELSE 'all' END,
   v.sort_order, v.name, p.position
 FROM area_metadata m JOIN segments s USING (indicator_id, area_id)
 JOIN sex_values v ON v.id = s.sex
 CROSS JOIN LATERAL (VALUES ('1-year', m.single, 0), ('3-year', m.rolling, 1)) p(period_type, present, position)
 WHERE NOT m.aggregate AND p.present
), variants AS MATERIALIZED (
 SELECT indicator_id, area_id,
   jsonb_agg(jsonb_build_object('sex', sex, 'periodType', period_type)
     ORDER BY sex_order, sex_name, period_order) AS variants
 FROM variant_choices GROUP BY indicator_id, area_id
), rollups AS (
 SELECT s.indicator_id, s.area_id, s.dimension_key, sex.name AS sex,
   p.period_type, p.length, p.first_point, p.latest_id, p.ranking_id, p.recent_ids, p.recent_values
 FROM segments s
 CROSS JOIN LATERAL (SELECT '' AS name UNION SELECT name FROM sex_values WHERE id = s.sex) sex
 CROSS JOIN LATERAL (VALUES
  ('all', s.all_length, s.all_first, s.all_latest, s.all_ranking, s.all_recent_ids, s.all_recent_values),
  ('1-year', s.single_length, s.single_first, s.single_latest, s.single_ranking, s.single_recent_ids, s.single_recent_values),
  ('3-year', s.rolling_length, s.rolling_first, s.rolling_latest, s.rolling_ranking, s.rolling_recent_ids, s.rolling_recent_values)
 ) p(period_type, length, first_point, latest_id, ranking_id, recent_ids, recent_values)
 WHERE p.length > 0
), winners AS MATERIALIZED (
 SELECT DISTINCT ON (indicator_id, area_id, sex, period_type) * FROM rollups
 ORDER BY indicator_id, area_id, sex, period_type,
   cardinality(string_to_array(dimension_key, ',')), length DESC,
   first_point COLLATE "C", dimension_key COLLATE "C"
), inserted AS (
 INSERT INTO observation_series (upload_batch_id, indicator_id, area_id, dimension_key, sex, period_type,
   variants, latest_observation_id, ranking_observation_id, recent_observation_ids, recent_values)
 SELECT v.upload_batch_id, w.indicator_id, w.area_id, w.dimension_key, w.sex, w.period_type,
   metadata.variants, w.latest_id, w.ranking_id,
   coalesce(w.recent_ids, '{}'::uuid[]), coalesce(w.recent_values, '{}'::double precision[])
 FROM winners w JOIN current_published_version cpv ON cpv.indicator_id = w.indicator_id
 JOIN indicator_version v ON v.id = cpv.id
 JOIN variants metadata ON metadata.indicator_id = w.indicator_id AND metadata.area_id = w.area_id
 RETURNING upload_batch_id
)
INSERT INTO observation_series_batch (upload_batch_id, indicator_id)
SELECT v.upload_batch_id, cpv.indicator_id
FROM current_published_version cpv JOIN indicator_version v ON v.id = cpv.id
WHERE v.upload_batch_id IS NOT NULL AND cpv.indicator_id = selected_indicator;
END LOOP;
END $$;

--> statement-breakpoint
ANALYZE observation_series;
--> statement-breakpoint
ANALYZE observation_series_batch;
