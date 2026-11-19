-- For the index builds below, over every observation.
SET LOCAL maintenance_work_mem = '512MB';--> statement-breakpoint
ALTER TABLE "observation" ADD COLUMN "numerator" double precision;--> statement-breakpoint

-- A value calculated from a numerator and a denominator had its numerator stored as the count, so
-- the figure moves to numerator for those value types: crude rate, directly standardised rate,
-- indirectly standardised proportion and ratio, proportion and ratio. Any other value type keeps
-- its count. The value type is the one of the version the observation's batch was uploaded to.
-- A survey indicator whose count is an estimated number of people rather than its numerator, such
-- as smoking prevalence from the Annual Population Survey (92443), keeps its count too.
-- Only batches a system user wrote, the migrated Fingertips data, move: a publisher's own upload
-- keeps the columns its file had, which the batch's column_names records.
-- Rebuilding the secondary indexes after the rewrite is quicker than updating them row by row.
DROP INDEX "idx_obs_indicator_dates";--> statement-breakpoint
DROP INDEX "idx_obs_area_indicator";--> statement-breakpoint
DROP INDEX "idx_obs_indicator_area_from";--> statement-breakpoint
DROP INDEX "idx_observation_area_from_indicator";--> statement-breakpoint
DROP INDEX "idx_observation_batch_area_dates_dimension_key";--> statement-breakpoint
UPDATE "observation" o
SET "numerator" = o."count", "count" = NULL
FROM "upload_batch" b
JOIN "indicator_version" v ON v.id = b.indicator_version_id
JOIN "indicator" i ON i.id = v.indicator_id
JOIN "app_user" u ON u.id = b.uploaded_by
WHERE b.id = o.upload_batch_id
  AND u.kind = 'system'
  AND o."count" IS NOT NULL
  AND i.short_id NOT IN (92443)
  AND v.value_type_id IN (
    '01a0d8a5-3ca2-7315-bfca-96c8c77cad18',
    '01a0d8a5-3ca2-7315-bfca-96c9664c846c',
    '01a0d8a5-3ca2-7315-bfca-96cc2dc711c3',
    '01a0d8a5-3ca2-7315-bfca-96cda63ea940',
    '01a0d8a5-3ca2-7315-bfca-96d2031a65e7',
    '01a0d8a5-3ca2-7315-bfca-96d34a17c74b'
  );--> statement-breakpoint
CREATE INDEX "idx_obs_indicator_dates" ON "observation" USING btree ("indicator_id","from_date","to_date") WHERE "observation"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_obs_area_indicator" ON "observation" USING btree ("area_id","indicator_id") WHERE "observation"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_obs_indicator_area_from" ON "observation" USING btree ("indicator_id","area_id","from_date") WHERE "observation"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_observation_area_from_indicator" ON "observation" USING btree ("area_id","from_date","indicator_id") WHERE "observation"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_observation_batch_area_dates_dimension_key" ON "observation" USING btree ("upload_batch_id","area_id","from_date","to_date","dimension_key");--> statement-breakpoint

-- A replaced view may only add columns at the end; the grants and the views reading it stay.
CREATE OR REPLACE VIEW published.observation AS
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
  o.distribution_rank,
  o.created_at,
  o.numerator
FROM observation o
WHERE o.deleted_at IS NULL
  AND o.upload_batch_id = ANY (ARRAY(
    SELECT v.upload_batch_id
    FROM current_published_version cpv
    JOIN indicator_version v ON v.id = cpv.id
  ));
