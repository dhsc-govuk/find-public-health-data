ALTER TABLE "indicator_version" ADD COLUMN "standard_population" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "standard_population_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "unit_other" text;--> statement-breakpoint
-- The rows are the vocabularies in @fphd/utils/value-type-and-unit, whose ids the app knows.
-- The Fingertips rows give up their names first, as most are the new rows' names too.
UPDATE "value_type" SET "name" = 'Fingertips: ' || "name";--> statement-breakpoint
INSERT INTO "value_type" ("id", "name") VALUES
  ('01a0d8a5-3ca2-7315-bfca-96c7324d4347', 'Count'),
  ('01a0d8a5-3ca2-7315-bfca-96c8c77cad18', 'Crude rate'),
  ('01a0d8a5-3ca2-7315-bfca-96c9664c846c', 'Directly standardised rate'),
  ('01a0d8a5-3ca2-7315-bfca-96ca4c9608e9', 'Excess risk'),
  ('01a0d8a5-3ca2-7315-bfca-96cb03846bff', 'Gap'),
  ('01a0d8a5-3ca2-7315-bfca-96cc2dc711c3', 'Indirectly standardised proportion'),
  ('01a0d8a5-3ca2-7315-bfca-96cda63ea940', 'Indirectly standardised ratio'),
  ('01a0d8a5-3ca2-7315-bfca-96ce5ffc8d47', 'Life expectancy'),
  ('01a0d8a5-3ca2-7315-bfca-96cff286704d', 'Mean'),
  ('01a0d8a5-3ca2-7315-bfca-96d0928fd186', 'Median'),
  ('01a0d8a5-3ca2-7315-bfca-96d1b508d83f', 'Percentage point'),
  ('01a0d8a5-3ca2-7315-bfca-96d2031a65e7', 'Proportion'),
  ('01a0d8a5-3ca2-7315-bfca-96d34a17c74b', 'Ratio'),
  ('01a0f31b-a23f-749d-a9ea-68b179920ab3', 'Relative index of inequality'),
  ('01a0d8a5-3ca2-7315-bfca-96d4cc7f7bcb', 'Score'),
  ('01a0d8a5-3ca2-7315-bfca-96d54168d21f', 'Slope index of inequality');--> statement-breakpoint
-- export/value_type_and_unit.py holds the same translation.
UPDATE "indicator_version" v
SET "value_type_id" = m.value_type_id
FROM "value_type" t
JOIN (VALUES
  ('Count', '01a0d8a5-3ca2-7315-bfca-96c7324d4347'::uuid),
  ('Crude rate', '01a0d8a5-3ca2-7315-bfca-96c8c77cad18'),
  ('Directly standardised rate', '01a0d8a5-3ca2-7315-bfca-96c9664c846c'),
  ('Excess risk', '01a0d8a5-3ca2-7315-bfca-96ca4c9608e9'),
  ('Gap', '01a0d8a5-3ca2-7315-bfca-96cb03846bff'),
  ('Indirectly standardised proportion', '01a0d8a5-3ca2-7315-bfca-96cc2dc711c3'),
  ('Indirectly standardised ratio', '01a0d8a5-3ca2-7315-bfca-96cda63ea940'),
  ('Life expectancy', '01a0d8a5-3ca2-7315-bfca-96ce5ffc8d47'),
  ('Mean', '01a0d8a5-3ca2-7315-bfca-96cff286704d'),
  ('Median', '01a0d8a5-3ca2-7315-bfca-96d0928fd186'),
  ('Percentage point', '01a0d8a5-3ca2-7315-bfca-96d1b508d83f'),
  ('Proportion', '01a0d8a5-3ca2-7315-bfca-96d2031a65e7'),
  ('Ratio', '01a0d8a5-3ca2-7315-bfca-96d34a17c74b'),
  ('Relative index of inequality', '01a0f31b-a23f-749d-a9ea-68b179920ab3'),
  ('Score', '01a0d8a5-3ca2-7315-bfca-96d4cc7f7bcb'),
  ('Slope index of inequality', '01a0d8a5-3ca2-7315-bfca-96d54168d21f'),
  ('Slope Index of Inequality', '01a0d8a5-3ca2-7315-bfca-96d54168d21f'),
  ('Relative Index of Inequality', '01a0f31b-a23f-749d-a9ea-68b179920ab3'),
  ('Number', '01a0d8a5-3ca2-7315-bfca-96c7324d4347'),
  ('Months life lost', '01a0d8a5-3ca2-7315-bfca-96c7324d4347'),
  ('Rate ratio', '01a0d8a5-3ca2-7315-bfca-96d34a17c74b'),
  ('Indirectly standardised rate', '01a0d8a5-3ca2-7315-bfca-96cc2dc711c3'),
  -- Pholio's placeholder for the value type the Fingertips API gives id 21, Gap.
  ('Unknown value type 21', '01a0d8a5-3ca2-7315-bfca-96cb03846bff')
) AS m(name, value_type_id) ON t.name = 'Fingertips: ' || m.name
WHERE t.id = v.value_type_id;--> statement-breakpoint
-- published.unit selected every column, so it goes while two of them are dropped.
DROP VIEW published.unit;--> statement-breakpoint
ALTER TABLE "unit" DROP COLUMN "label";--> statement-breakpoint
ALTER TABLE "unit" DROP COLUMN "multiplier";--> statement-breakpoint
UPDATE "unit" SET "name" = 'Fingertips: ' || "name";--> statement-breakpoint
-- Pholio's placeholders for units the Fingertips API names take the name of Pholio's unit with
-- the label and multiplier the API gives their id.
UPDATE "unit" u
SET "name" = 'Fingertips: ' || m.name
FROM (VALUES
  ('Unknown unit 54', 'admissions'),
  ('Unknown unit 56', '£'),
  ('Unknown unit 57', 'per 1,000,000'),
  ('Unknown unit 58', 'Minutes'),
  ('Unknown unit 59', 'per 100,000 bed-days'),
  ('Unknown unit 60', 'per 100'),
  ('Unknown unit 61', 'litres per adult'),
  ('Unknown unit 63', 'µg/m-3 (micrograms per cubic meter)'),
  ('Unknown unit 65', 'per 100 procedures'),
  ('Unknown unit 66', 'Score'),
  ('Unknown unit 67', 'Count'),
  ('Unknown unit 68', 'Percentage points'),
  ('Unknown unit 71', 'per 1,000, per day '),
  ('Unknown unit 72', 'per 100,000 smoking population aged 18+'),
  ('Unknown unit 73', 'per re-offender'),
  ('Unknown unit 74', 'per 1,000,000,000 vehicle miles'),
  ('Unknown unit 75', 'Persons per km2'),
  ('Unknown unit 76', 'Centimetre')
) AS m(placeholder, name)
WHERE u.name = 'Fingertips: ' || m.placeholder;--> statement-breakpoint
INSERT INTO "unit" ("id", "name") VALUES
  ('01a0d8a5-3ca2-7315-bfca-96d615820bd4', '%'),
  ('01a0d8a5-3ca2-7315-bfca-96d787920e40', 'per 100'),
  ('01a0d8a5-3ca2-7315-bfca-96d8d8d7aec2', 'per 1,000'),
  ('01a0d8a5-3ca2-7315-bfca-96d97b88dbff', 'per 10,000'),
  ('01a0d8a5-3ca2-7315-bfca-96daa0c93ee9', 'per 100,000'),
  ('01a0d8a5-3ca2-7315-bfca-96dbaf432da2', 'per 1,000,000'),
  ('01a0d8a5-3ca2-7315-bfca-96dca2ab3487', 'minutes'),
  ('01a0d8a5-3ca2-7315-bfca-96dd9ae52dc5', 'hours'),
  ('01a0d8a5-3ca2-7315-bfca-96de5fe00871', 'days'),
  ('01a0d8a5-3ca2-7315-bfca-96df3a570e5d', 'weeks'),
  ('01a0d8a5-3ca2-7315-bfca-96e0128fd88d', 'months'),
  ('01a0d8a5-3ca2-7315-bfca-96e1a3b040d3', 'years'),
  ('01a0d8a5-3ca2-7315-bfca-96e2d3cf5df0', '£'),
  ('01a0d8a5-3ca2-7315-bfca-96e3aae4dc98', '£ per capita'),
  ('01a0d8a5-3ca2-7315-bfca-96e4a96bfc8e', 'No unit'),
  ('01a0d8a5-3ca2-7315-bfca-96e5cee57158', 'Other');--> statement-breakpoint
UPDATE "indicator_version" v
SET "unit_id" = m.unit_id
FROM "unit" u
JOIN (VALUES
  ('Percent', '01a0d8a5-3ca2-7315-bfca-96d615820bd4'::uuid),
  ('per 100', '01a0d8a5-3ca2-7315-bfca-96d787920e40'),
  ('per 1,000', '01a0d8a5-3ca2-7315-bfca-96d8d8d7aec2'),
  ('per 10,000', '01a0d8a5-3ca2-7315-bfca-96d97b88dbff'),
  ('per 100,000', '01a0d8a5-3ca2-7315-bfca-96daa0c93ee9'),
  ('per 1,000,000', '01a0d8a5-3ca2-7315-bfca-96dbaf432da2'),
  ('Minutes', '01a0d8a5-3ca2-7315-bfca-96dca2ab3487'),
  ('Days', '01a0d8a5-3ca2-7315-bfca-96de5fe00871'),
  ('Years', '01a0d8a5-3ca2-7315-bfca-96e1a3b040d3'),
  ('£', '01a0d8a5-3ca2-7315-bfca-96e2d3cf5df0'),
  ('£ per capita', '01a0d8a5-3ca2-7315-bfca-96e3aae4dc98'),
  ('No unit', '01a0d8a5-3ca2-7315-bfca-96e4a96bfc8e')
) AS m(name, unit_id) ON u.name = 'Fingertips: ' || m.name
WHERE u.id = v.unit_id;--> statement-breakpoint
-- Any other named Fingertips unit is an other unit, named as Fingertips named it.
UPDATE "indicator_version" v
SET "unit_id" = '01a0d8a5-3ca2-7315-bfca-96e5cee57158', "unit_other" = n.name
FROM "unit" u
CROSS JOIN LATERAL (SELECT btrim(substr(u.name, length('Fingertips: ') + 1)) AS name) n
WHERE u.id = v.unit_id
  AND u.name LIKE 'Fingertips: %'
  AND n.name <> ''
  AND n.name NOT LIKE 'Unknown unit %'
  AND length(n.name) <= 100;--> statement-breakpoint
-- Stops rather than drop an answer none of the translations covers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "indicator_version" v JOIN "value_type" t ON t.id = v.value_type_id
    WHERE t.name LIKE 'Fingertips: %'
  ) THEN
    RAISE EXCEPTION 'indicator_version references a value type with no value to translate it to';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "indicator_version" v JOIN "unit" u ON u.id = v.unit_id
    WHERE u.name LIKE 'Fingertips: %'
  ) THEN
    RAISE EXCEPTION 'indicator_version references a unit with no value to translate it to';
  END IF;
END
$$;--> statement-breakpoint
DELETE FROM "value_type" WHERE "name" LIKE 'Fingertips: %';--> statement-breakpoint
DELETE FROM "unit" WHERE "name" LIKE 'Fingertips: %';--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_standard_population_check" CHECK ("indicator_version"."standard_population" IN ('esp-2013', 'other'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_standard_population_value_type_check" CHECK ("indicator_version"."standard_population" IS NULL OR "indicator_version"."value_type_id" = '01a0d8a5-3ca2-7315-bfca-96c9664c846c');--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_standard_population_detail_check" CHECK ("indicator_version"."standard_population_detail" IS NULL OR "indicator_version"."standard_population" IS NOT DISTINCT FROM 'other' OR "indicator_version"."value_type_id" IN ('01a0d8a5-3ca2-7315-bfca-96cc2dc711c3', '01a0d8a5-3ca2-7315-bfca-96cda63ea940'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_standard_population_other_check" CHECK ("indicator_version"."standard_population" IS DISTINCT FROM 'other' OR "indicator_version"."standard_population_detail" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_unit_other_check" CHECK (("indicator_version"."unit_other" IS NOT NULL) = ("indicator_version"."unit_id" IS NOT DISTINCT FROM '01a0d8a5-3ca2-7315-bfca-96e5cee57158'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_unit_other_length_check" CHECK (length("indicator_version"."unit_other") <= 100);--> statement-breakpoint
CREATE VIEW published.unit AS SELECT * FROM unit;--> statement-breakpoint
GRANT SELECT ON published.unit TO public_api, internal_api;--> statement-breakpoint
-- published.indicator is rebuilt with the unit a publisher names under "Other".
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
  v.unit_other,
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
GRANT SELECT ON published.indicator TO public_api, internal_api;
