-- For the observation and observation_dimension index builds below.
SET LOCAL maintenance_work_mem = '512MB';--> statement-breakpoint

-- The published views that read a dropped column go first, and come back without it at the end
-- with their grants. The observation_dimension and observation_note views also come back without
-- their id, which nothing reads.
DROP VIEW published.observation_note;--> statement-breakpoint
DROP VIEW published.observation_dimension;--> statement-breakpoint
DROP VIEW published.observation;--> statement-breakpoint
DROP VIEW published.dimension_type;--> statement-breakpoint
DROP VIEW published.area_type;--> statement-breakpoint

-- Renamed rather than dropped and added again, because composite foreign keys depend on three of
-- these.
ALTER TABLE "indicator" RENAME CONSTRAINT "indicator_shortId_unique" TO "indicator_short_id_unique";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME CONSTRAINT "indicator_version_id_indicatorId_unique" TO "indicator_version_id_indicator_id_unique";--> statement-breakpoint
ALTER TABLE "upload_batch" RENAME CONSTRAINT "upload_batch_id_indicatorId_unique" TO "upload_batch_id_indicator_id_unique";--> statement-breakpoint
ALTER TABLE "dimension_value" RENAME CONSTRAINT "dimension_value_dimensionTypeId_name_unique" TO "dimension_value_dimension_type_id_name_unique";--> statement-breakpoint
ALTER TABLE "dimension_value" RENAME CONSTRAINT "dimension_value_id_dimensionTypeId_unique" TO "dimension_value_id_dimension_type_id_unique";--> statement-breakpoint
ALTER TABLE "observation_dimension" RENAME CONSTRAINT "observation_dimension_observationId_dimensionTypeId_unique" TO "observation_dimension_observation_id_dimension_type_id_unique";--> statement-breakpoint
ALTER TABLE "observation_note" RENAME CONSTRAINT "observation_note_observationId_noteTypeId_unique" TO "observation_note_observation_id_note_type_id_unique";--> statement-breakpoint

ALTER INDEX "idx_dim_val_type" RENAME TO "idx_dimension_value_type";--> statement-breakpoint
ALTER INDEX "idx_dim_val_parent" RENAME TO "idx_dimension_value_parent";--> statement-breakpoint
ALTER INDEX "idx_area_validity" RENAME TO "idx_area_type_validity";--> statement-breakpoint
ALTER INDEX "idx_area_rel_parent" RENAME TO "idx_area_relationship_parent";--> statement-breakpoint
ALTER INDEX "idx_area_rel_child" RENAME TO "idx_area_relationship_child";--> statement-breakpoint

-- Code lookups use the area_code_validity_excl exclusion index, and idx_area_type_validity
-- leads with the area type.
DROP INDEX "idx_area_code";--> statement-breakpoint
DROP INDEX "idx_area_code_validity";--> statement-breakpoint
DROP INDEX "idx_area_type";--> statement-breakpoint
DROP INDEX "idx_indicator_version_definition_trgm";--> statement-breakpoint

-- The observation_dimension index on dimension_value_id alone serves the same lookups as the
-- two-column one it replaces, at a fraction of the size.
DROP INDEX "idx_obs_dim_val_obs";--> statement-breakpoint
CREATE INDEX "idx_observation_dimension_value" ON "observation_dimension" USING btree ("dimension_value_id");--> statement-breakpoint

-- Every observation index was partial on deleted_at. The two kept are built again over every row
-- once the column is gone.
DROP INDEX "idx_obs_indicator_dates";--> statement-breakpoint
DROP INDEX "idx_obs_area_indicator";--> statement-breakpoint
DROP INDEX "idx_obs_indicator_area_from";--> statement-breakpoint
DROP INDEX "idx_observation_area_from_indicator";--> statement-breakpoint
ALTER TABLE "observation" DROP COLUMN "distribution_rank";--> statement-breakpoint
ALTER TABLE "observation" DROP COLUMN "published_at";--> statement-breakpoint
ALTER TABLE "observation" DROP COLUMN "deleted_at";--> statement-breakpoint
CREATE INDEX "idx_observation_indicator_dates" ON "observation" USING btree ("indicator_id","from_date","to_date");--> statement-breakpoint
CREATE INDEX "idx_observation_indicator_area_from" ON "observation" USING btree ("indicator_id","area_id","from_date");--> statement-breakpoint

ALTER TABLE "dimension_type" DROP COLUMN "scheme_version";--> statement-breakpoint
ALTER TABLE "area_type" DROP COLUMN "level";--> statement-breakpoint

-- Adding the narrower status check stops the migration at a batch that is validated or superseded.
ALTER TABLE "upload_batch" DROP CONSTRAINT "upload_batch_kind_check";--> statement-breakpoint
ALTER TABLE "upload_batch" DROP CONSTRAINT "upload_batch_base_batch_check";--> statement-breakpoint
ALTER TABLE "upload_batch" DROP CONSTRAINT "upload_batch_superseded_check";--> statement-breakpoint
ALTER TABLE "upload_batch" DROP CONSTRAINT "upload_batch_status_check";--> statement-breakpoint
ALTER TABLE "upload_batch" DROP COLUMN "superseded_by_id";--> statement-breakpoint
ALTER TABLE "upload_batch" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "upload_batch" DROP COLUMN "base_batch_id";--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_status_check" CHECK ("upload_batch"."status" IN ('received', 'processed', 'failed'));--> statement-breakpoint

CREATE VIEW published.area_type AS SELECT * FROM area_type;--> statement-breakpoint
CREATE VIEW published.dimension_type AS SELECT * FROM dimension_type;--> statement-breakpoint

-- Share the publication lookup across every observation read in a statement.
CREATE VIEW published.observation AS
SELECT
  o.id,
  o.indicator_id,
  o.area_id,
  o.from_date,
  o.to_date,
  o.value,
  o.count,
  o.denominator,
  o.denominator_2,
  o.lower_ci_95,
  o.upper_ci_95,
  o.lower_ci_998,
  o.upper_ci_998,
  o.created_at,
  o.numerator,
  o.dimension_key
FROM observation o
WHERE o.upload_batch_id = ANY (ARRAY(
  SELECT v.upload_batch_id
  FROM current_published_version cpv
  JOIN indicator_version v ON v.id = cpv.id
));--> statement-breakpoint

CREATE VIEW published.observation_dimension AS
SELECT od.observation_id, od.dimension_value_id, od.dimension_type_id
FROM observation_dimension od
WHERE EXISTS (
 SELECT 1 FROM observation o
 WHERE o.id = od.observation_id
 AND o.upload_batch_id = ANY (ARRAY(
  SELECT v.upload_batch_id FROM current_published_version cpv
  JOIN indicator_version v ON v.id = cpv.id
 ))
);--> statement-breakpoint

CREATE VIEW published.observation_note AS
SELECT onote.observation_id, onote.note_type_id
FROM observation_note onote
WHERE EXISTS (
 SELECT 1 FROM observation o
 WHERE o.id = onote.observation_id
 AND o.upload_batch_id = ANY (ARRAY(
  SELECT v.upload_batch_id FROM current_published_version cpv
  JOIN indicator_version v ON v.id = cpv.id
 ))
);--> statement-breakpoint

GRANT SELECT ON published.area_type, published.dimension_type, published.observation,
  published.observation_dimension, published.observation_note
TO public_api, internal_api;
