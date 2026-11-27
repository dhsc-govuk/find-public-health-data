DROP VIEW "published"."observation";--> statement-breakpoint
DROP INDEX "idx_observation_batch_area_dates_dimension_key";--> statement-breakpoint
ALTER TABLE "observation" ADD COLUMN "period_type" text;--> statement-breakpoint
ALTER TABLE "observation" ADD COLUMN "is_current_series" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_observation_batch_area_dates_dimension_key" ON "observation" USING btree ("upload_batch_id","area_id","from_date","to_date","dimension_key",coalesce("period_type", ''));--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_period_type_check" CHECK ("observation"."period_type" IS NULL OR "observation"."period_type" = 'cumulative-quarter-' || to_char("observation"."from_date", 'YYYY-MM-DD'));--> statement-breakpoint
CREATE VIEW "published"."observation" AS (SELECT o.id, o.indicator_id, o.area_id, o.from_date, o.to_date, o.value,
        o.count, o.denominator, o.denominator_2, o.lower_ci_95, o.upper_ci_95,
        o.lower_ci_998, o.upper_ci_998, o.created_at, o.numerator, o.dimension_key, o.period_type
      FROM public.observation o
      WHERE o.is_current_series AND o.from_date >= ((
        SELECT jsonb_object_agg(v.upload_batch_id, COALESCE(v.published_from, '-infinity'::date))
        FROM public.current_published_version cpv
        JOIN public.indicator_version v ON v.id = cpv.id
        WHERE v.upload_batch_id IS NOT NULL
      ) ->> o.upload_batch_id::text)::date);--> statement-breakpoint
-- Recreating the view removes its explicit read grants.
GRANT SELECT ON "published"."observation" TO public_api, internal_api;--> statement-breakpoint
-- The dimension and note views hide the rows of observations outside the current series, as
-- published.observation does. Replacing a view keeps its grants.
CREATE OR REPLACE VIEW published.observation_dimension AS
SELECT od.observation_id, od.dimension_value_id, od.dimension_type_id
FROM observation_dimension od
WHERE EXISTS (
  SELECT 1 FROM observation o
  WHERE o.id = od.observation_id
    AND o.is_current_series
    AND o.upload_batch_id = ANY (ARRAY(
      SELECT v.upload_batch_id
      FROM current_published_version cpv
      JOIN indicator_version v ON v.id = cpv.id
    ))
    AND (
      NOT (COALESCE((
        SELECT jsonb_object_agg(v.upload_batch_id, v.published_from)
        FROM current_published_version cpv
        JOIN indicator_version v ON v.id = cpv.id
        WHERE v.published_from IS NOT NULL AND v.upload_batch_id IS NOT NULL
      ), '{}'::jsonb) ? o.upload_batch_id::text)
      OR o.from_date >= ((
        SELECT jsonb_object_agg(v.upload_batch_id, v.published_from)
        FROM current_published_version cpv
        JOIN indicator_version v ON v.id = cpv.id
        WHERE v.published_from IS NOT NULL AND v.upload_batch_id IS NOT NULL
      ) ->> o.upload_batch_id::text)::date
    )
);
--> statement-breakpoint
CREATE OR REPLACE VIEW published.observation_note AS
SELECT onote.observation_id, onote.note_type_id
FROM observation_note onote
WHERE EXISTS (
  SELECT 1 FROM observation o
  WHERE o.id = onote.observation_id
    AND o.is_current_series
    AND o.upload_batch_id = ANY (ARRAY(
      SELECT v.upload_batch_id
      FROM current_published_version cpv
      JOIN indicator_version v ON v.id = cpv.id
    ))
    AND (
      NOT (COALESCE((
        SELECT jsonb_object_agg(v.upload_batch_id, v.published_from)
        FROM current_published_version cpv
        JOIN indicator_version v ON v.id = cpv.id
        WHERE v.published_from IS NOT NULL AND v.upload_batch_id IS NOT NULL
      ), '{}'::jsonb) ? o.upload_batch_id::text)
      OR o.from_date >= ((
        SELECT jsonb_object_agg(v.upload_batch_id, v.published_from)
        FROM current_published_version cpv
        JOIN indicator_version v ON v.id = cpv.id
        WHERE v.published_from IS NOT NULL AND v.upload_batch_id IS NOT NULL
      ) ->> o.upload_batch_id::text)::date
    )
);
