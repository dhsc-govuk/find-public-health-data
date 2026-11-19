CREATE TABLE "period_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "period_type_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "period_type_id" uuid;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "year_end_day" smallint;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "year_end_month" smallint;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_period_type_id_period_type_id_fk" FOREIGN KEY ("period_type_id") REFERENCES "public"."period_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- The rows are the vocabularies in @fphd/utils/period-type, whose ids the app knows.
INSERT INTO "period_type" ("id", "name") VALUES
  ('01a0d88c-310a-7c54-b512-a99ca789cc12', 'Years'),
  ('01a0d88c-310a-7c9d-b589-353d97eedb54', 'Quarters'),
  ('01a0d88c-310a-7ca1-9ba4-031b00f46799', 'Months');--> statement-breakpoint

-- The Fingertips year types become the service's five, with the period type and any year end
-- date each implies; export/year_type.py holds the same translation. The legacy rows give up
-- their names first, as three of them are the new rows' names too.
UPDATE "year_type" SET "name" = 'Fingertips: ' || "name";--> statement-breakpoint
INSERT INTO "year_type" ("id", "name") VALUES
  ('01a0d88c-310a-7ca5-8494-19e32c307628', 'Calendar'),
  ('01a0d88c-310a-7ca8-9a3b-40fc6f585b8a', 'Financial'),
  ('01a0d88c-310a-7cab-8847-543e49e4c685', 'Academic'),
  ('01a0d88c-310a-7cae-ae91-2c6e6e6b707a', 'Rolling'),
  ('01a0d88c-310a-7cb1-af6e-3712b2958e12', 'Ending a specified date');--> statement-breakpoint
UPDATE "indicator_version" v
SET
  "period_type_id" = m.period_type_id,
  "year_type_id" = m.year_type_id,
  "year_end_day" = m.day,
  "year_end_month" = m.month
FROM "year_type" y
JOIN (VALUES
  ('Calendar', '01a0d88c-310a-7c54-b512-a99ca789cc12'::uuid, '01a0d88c-310a-7ca5-8494-19e32c307628'::uuid, NULL::smallint, NULL::smallint),
  ('Financial', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7ca8-9a3b-40fc6f585b8a', NULL, NULL),
  ('Academic', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cab-8847-543e49e4c685', NULL, NULL),
  ('August-July', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cb1-af6e-3712b2958e12', 31, 7),
  ('July-June', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cb1-af6e-3712b2958e12', 30, 6),
  ('October-September', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cb1-af6e-3712b2958e12', 30, 9),
  ('March-February', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cb1-af6e-3712b2958e12', 28, 2),
  ('November-November', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cb1-af6e-3712b2958e12', 15, 11),
  ('September-January', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cb1-af6e-3712b2958e12', 31, 1),
  ('September-February', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cb1-af6e-3712b2958e12', 28, 2),
  ('Calendar rolling year - monthly', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cae-ae91-2c6e6e6b707a', NULL, NULL),
  ('Calendar rolling year - quarterly', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cae-ae91-2c6e6e6b707a', NULL, NULL),
  ('Financial rolling year - monthly', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cae-ae91-2c6e6e6b707a', NULL, NULL),
  ('Financial rolling year - quarterly', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cae-ae91-2c6e6e6b707a', NULL, NULL),
  ('Financial single year cumulative quarters', '01a0d88c-310a-7c9d-b589-353d97eedb54', '01a0d88c-310a-7ca8-9a3b-40fc6f585b8a', NULL, NULL),
  ('Financial multi year cumulative quarters', '01a0d88c-310a-7c9d-b589-353d97eedb54', '01a0d88c-310a-7ca8-9a3b-40fc6f585b8a', NULL, NULL),
  ('Financial year end point', '01a0d88c-310a-7c54-b512-a99ca789cc12', '01a0d88c-310a-7cb1-af6e-3712b2958e12', 31, 3)
) AS m(name, period_type_id, year_type_id, day, month) ON y.name = 'Fingertips: ' || m.name
WHERE y.id = v.year_type_id;--> statement-breakpoint
-- Stops rather than drop an answer none of the translations covers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "indicator_version" v JOIN "year_type" y ON y.id = v.year_type_id
    WHERE y.name LIKE 'Fingertips: %'
  ) THEN
    RAISE EXCEPTION 'indicator_version references a year type with no value to translate it to';
  END IF;
END
$$;--> statement-breakpoint
DELETE FROM "year_type" WHERE "name" LIKE 'Fingertips: %';--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_year_type_check" CHECK (("indicator_version"."year_type_id" IS NOT NULL) = ("indicator_version"."period_type_id" IS NOT NULL AND "indicator_version"."period_type_id" <> '01a0d88c-310a-7ca1-9ba4-031b00f46799'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_year_end_check" CHECK (("indicator_version"."year_end_day" IS NOT NULL) = ("indicator_version"."year_type_id" IS NOT DISTINCT FROM '01a0d88c-310a-7cb1-af6e-3712b2958e12') AND ("indicator_version"."year_end_month" IS NOT NULL) = ("indicator_version"."year_end_day" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_year_end_date_check" CHECK ("indicator_version"."year_end_month" BETWEEN 1 AND 12 AND "indicator_version"."year_end_day" BETWEEN 1 AND CASE WHEN "indicator_version"."year_end_month" = 2 THEN 29 WHEN "indicator_version"."year_end_month" IN (4, 6, 9, 11) THEN 30 ELSE 31 END);--> statement-breakpoint

-- published.indicator is rebuilt with the year end beside the year type.
DROP VIEW published.indicator;--> statement-breakpoint
CREATE VIEW published.indicator AS
SELECT
  i.id,
  i.short_id,
  i.data_updated_at,
  i.created_at,
  v.name,
  v.slug,
  v.value_type_id,
  v.unit_id,
  v.year_type_id,
  v.year_end_day,
  v.year_end_month,
  v.ci_method_id,
  v.polarity,
  v.update_frequency,
  v.comparator_method_id,
  v.disclosure_threshold,
  v.ci_confidence_level,
  v.config,
  v.definition,
  v.rationale,
  v.methodology,
  v.numerator_definition,
  v.denominator_definition,
  v.disclosure_control_detail,
  v.caveats_detail,
  v.other_notes_detail,
  v.data_source_id,
  v.updated_at,
  p.first_published_at,
  p.last_published_at
FROM indicator i
JOIN current_published_version cpv ON cpv.indicator_id = i.id
JOIN indicator_version v ON v.id = cpv.id
CROSS JOIN LATERAL (
  SELECT min(pv.published_at) AS first_published_at, max(pv.published_at) AS last_published_at
  FROM indicator_version pv
  WHERE pv.indicator_id = i.id
) p;--> statement-breakpoint
GRANT SELECT ON published.indicator TO public_api, internal_api;--> statement-breakpoint
-- Lets the publisher's API read the period type lookup; nothing published carries period type.
GRANT SELECT ON period_type TO internal_api;
