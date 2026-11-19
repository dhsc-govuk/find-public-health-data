-- For the index builds below, over every observation.
SET LOCAL maintenance_work_mem = '512MB';--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_id_indicatorId_unique" UNIQUE("id","indicator_id");--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "upload_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "data_table_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD COLUMN "indicator_version_id" uuid;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD COLUMN "blob_name" text;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD COLUMN "byte_size" bigint;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD COLUMN "row_count" integer;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD COLUMN "column_names" text[];--> statement-breakpoint
ALTER TABLE "upload_batch" ADD COLUMN "kind" text DEFAULT 'replace' NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD COLUMN "base_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "observation" ALTER COLUMN "published_at" DROP NOT NULL;--> statement-breakpoint

-- Rebuilding the secondary indexes after the rewrite below is quicker than updating them row by
-- row. The batch index goes for good: the natural key below leads with the batch.
DROP INDEX "idx_obs_upload_batch";--> statement-breakpoint
DROP INDEX "idx_obs_indicator_dates";--> statement-breakpoint
DROP INDEX "idx_obs_area_indicator";--> statement-breakpoint
DROP INDEX "idx_obs_indicator_area_from";--> statement-breakpoint
DROP INDEX "idx_observation_area_from_indicator";--> statement-breakpoint
-- A total has no dimension values, so only the rows bridged to some are rewritten.
ALTER TABLE "observation" ADD COLUMN "dimension_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "observation" o
SET "dimension_key" = k.dimension_key
FROM (
  SELECT observation_id, string_agg(dimension_value_id::text, ',' ORDER BY dimension_value_id) AS dimension_key
  FROM "observation_dimension"
  GROUP BY observation_id
) k
WHERE k.observation_id = o.id;--> statement-breakpoint
ALTER TABLE "observation" ALTER COLUMN "dimension_key" DROP DEFAULT;--> statement-breakpoint

-- Batches predate versions, so each existing batch is credited to its indicator's current
-- published version, or to its draft when nothing is published.
UPDATE "upload_batch" b
SET "indicator_version_id" = coalesce(
  (SELECT cpv.id FROM current_published_version cpv WHERE cpv.indicator_id = b.indicator_id),
  (SELECT v.id FROM indicator_version v WHERE v.indicator_id = b.indicator_id AND v.status = 'draft')
);--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "upload_batch" WHERE "indicator_version_id" IS NULL) THEN
    RAISE EXCEPTION 'upload_batch belongs to an indicator with no version to link it to';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "upload_batch" ALTER COLUMN "indicator_version_id" SET NOT NULL;--> statement-breakpoint

-- Every version of an indicator points at its latest processed batch, as confirmed: the data was
-- accepted before there was a check page to confirm it on. pointVersionsAtBatches in seeding.ts
-- applies the same rule to the seed files.
UPDATE "indicator_version" v
SET "upload_batch_id" = b.id, "data_table_confirmed_at" = b.uploaded_at
FROM (
  SELECT DISTINCT ON (indicator_id) id, indicator_id, uploaded_at
  FROM "upload_batch"
  WHERE status = 'processed'
  ORDER BY indicator_id, uploaded_at DESC, id DESC
) b
WHERE b.indicator_id = v.indicator_id;--> statement-breakpoint
-- Stops rather than hide an observation the public site shows today.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "observation" o
    JOIN current_published_version cpv ON cpv.indicator_id = o.indicator_id
    JOIN "indicator_version" v ON v.id = cpv.id
    WHERE o.deleted_at IS NULL AND o.upload_batch_id IS DISTINCT FROM v.upload_batch_id
  ) THEN
    RAISE EXCEPTION 'published observations lie outside the batch their published version points at';
  END IF;
END
$$;--> statement-breakpoint

ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_upload_batch_fk" FOREIGN KEY ("upload_batch_id","indicator_id") REFERENCES "public"."upload_batch"("id","indicator_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_base_batch_id_upload_batch_id_fk" FOREIGN KEY ("base_batch_id") REFERENCES "public"."upload_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_indicator_version_fk" FOREIGN KEY ("indicator_version_id","indicator_id") REFERENCES "public"."indicator_version"("id","indicator_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_obs_indicator_dates" ON "observation" USING btree ("indicator_id","from_date","to_date") WHERE "observation"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_obs_area_indicator" ON "observation" USING btree ("area_id","indicator_id") WHERE "observation"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_obs_indicator_area_from" ON "observation" USING btree ("indicator_id","area_id","from_date") WHERE "observation"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_observation_area_from_indicator" ON "observation" USING btree ("area_id","from_date","indicator_id") WHERE "observation"."deleted_at" IS NULL;--> statement-breakpoint
-- Repeated rows stop the migration here, naming one, rather than one of them being dropped.
CREATE UNIQUE INDEX "idx_observation_batch_area_dates_dimension_key" ON "observation" USING btree ("upload_batch_id","area_id","from_date","to_date","dimension_key");--> statement-breakpoint
CREATE INDEX "idx_upload_batch_indicator_version" ON "upload_batch" USING btree ("indicator_version_id");--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_data_table_confirmed_check" CHECK ("indicator_version"."data_table_confirmed_at" IS NULL OR "indicator_version"."upload_batch_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_kind_check" CHECK ("upload_batch"."kind" IN ('replace'));--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_base_batch_check" CHECK ("upload_batch"."kind" <> 'replace' OR "upload_batch"."base_batch_id" IS NULL);--> statement-breakpoint
DO $$
DECLARE
  unpaired text;
BEGIN
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO unpaired
  FROM (
    SELECT id FROM "upload_batch"
    WHERE (status = 'superseded') <> (superseded_by_id IS NOT NULL)
    ORDER BY id LIMIT 10
  ) b;
  IF unpaired IS NOT NULL THEN
    RAISE EXCEPTION 'upload_batch rows superseded without a successor, or with one while not superseded: %', unpaired;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_superseded_check" CHECK (("upload_batch"."status" = 'superseded') = ("upload_batch"."superseded_by_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_sha256_check" CHECK ("upload_batch"."sha256" ~ '^[0-9a-f]{64}$');--> statement-breakpoint

-- A row is public when its batch is the one the indicator's current published version points
-- at, so publishing switches the data over in one step and a draft's rows never show. The
-- published batches are gathered once per query rather than joined per row, which a lookup by
-- observation id, as the two views below make, would otherwise pay on every row. A batch belongs
-- to one indicator, so matching on it alone shows no other indicator's rows. Dropping
-- published_at means recreating the view, the two views that read it, and their grants.
DROP VIEW published.observation_note;--> statement-breakpoint
DROP VIEW published.observation_dimension;--> statement-breakpoint
DROP VIEW published.observation;--> statement-breakpoint
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
  o.distribution_rank,
  o.created_at
FROM observation o
WHERE o.deleted_at IS NULL
  AND o.upload_batch_id = ANY (ARRAY(
    SELECT v.upload_batch_id
    FROM current_published_version cpv
    JOIN indicator_version v ON v.id = cpv.id
  ));--> statement-breakpoint

CREATE VIEW published.observation_dimension AS
SELECT od.id, od.observation_id, od.dimension_value_id, od.dimension_type_id
FROM observation_dimension od
WHERE EXISTS (SELECT 1 FROM published.observation o WHERE o.id = od.observation_id);--> statement-breakpoint

CREATE VIEW published.observation_note AS
SELECT onote.id, onote.observation_id, onote.note_type_id
FROM observation_note onote
WHERE EXISTS (SELECT 1 FROM published.observation o WHERE o.id = onote.observation_id);--> statement-breakpoint

GRANT SELECT ON published.observation, published.observation_dimension, published.observation_note
TO public_api, internal_api;--> statement-breakpoint

-- The read-model views likewise gather the published indicators once per query rather than
-- scanning the versions for every row; columns, rows and grants are unchanged.
CREATE OR REPLACE VIEW published.latest_headline AS
SELECT lh.indicator_id, lh.area_id, lh.from_date, lh.to_date, lh.value, lh.lower_ci_95, lh.upper_ci_95
FROM latest_headline lh
WHERE lh.indicator_id = ANY (ARRAY(
  SELECT indicator_id FROM indicator_version WHERE status = 'published'
));--> statement-breakpoint
CREATE OR REPLACE VIEW published.available_data AS
SELECT ad.indicator_id, ad.area_type_id, ad.area_type_name, ad.area_count
FROM available_data ad
WHERE ad.indicator_id = ANY (ARRAY(
  SELECT indicator_id FROM indicator_version WHERE status = 'published'
));--> statement-breakpoint
CREATE OR REPLACE VIEW published.indicator_dimension_values AS
SELECT idv.indicator_id, idv.dimension_type_id, idv.dimension_type_name, idv.dimension_value_id, idv.dimension_value_name, idv.sort_order
FROM indicator_dimension_values idv
WHERE idv.indicator_id = ANY (ARRAY(
  SELECT indicator_id FROM indicator_version WHERE status = 'published'
));--> statement-breakpoint
CREATE OR REPLACE VIEW published.observation_range AS
SELECT orng.indicator_id, orng.display_group, orng.from_date, orng.to_date, orng.segment, orng.min, orng.max
FROM observation_range orng
WHERE orng.indicator_id = ANY (ARRAY(
  SELECT indicator_id FROM indicator_version WHERE status = 'published'
));--> statement-breakpoint

-- The upload writes batches and their rows: whole tables, as the other publisher writes are.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  observation, observation_dimension, observation_note, upload_batch
TO internal_api;
