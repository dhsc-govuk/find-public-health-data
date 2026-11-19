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
	"indicator_id" uuid NOT NULL,
	"trend_values" double precision[]
);
--> statement-breakpoint
CREATE INDEX "idx_observation_series_indicator_area" ON "observation_series" USING btree ("indicator_id","area_id");
--> statement-breakpoint
CREATE VIEW published.observation_series_batch AS
SELECT b.indicator_id, b.trend_values FROM observation_series_batch b
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
