-- Each note becomes a question and its detail. Fingertips prose that is an answer in itself,
-- such as "None applied", becomes that answer and is dropped; any other prose is kept as the
-- detail of a yes, and a version with no prose has no answer yet.
-- published.indicator reads the prose columns, so it is dropped here and rebuilt below.
DROP VIEW published.indicator;--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "disclosure_control" TO "disclosure_control_detail";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "caveats" TO "caveats_detail";--> statement-breakpoint
ALTER TABLE "indicator_version" RENAME COLUMN "notes" TO "other_notes_detail";--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "disclosure_control" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "rounding_applied" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "rounding_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "caveats_needed" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "other_notes_needed" boolean;--> statement-breakpoint
UPDATE "indicator_version" SET
  "disclosure_control_detail" = nullif(btrim("disclosure_control_detail", E' \t\r\n'), ''),
  "caveats_detail" = nullif(btrim("caveats_detail", E' \t\r\n'), ''),
  "other_notes_detail" = nullif(btrim("other_notes_detail", E' \t\r\n'), '');--> statement-breakpoint
-- Prose matches an entry whole once normalised: markup stripped, whitespace collapsed and
-- trimmed, lower-cased, one full stop dropped. The same list as VOCABULARY in
-- data/seed/export/notes_and_caveats.py, so a change here is made there too.
WITH vocabulary (question, prose, answer) AS (
  VALUES
    ('disclosure_control', 'none applied', 'no'),
    ('disclosure_control', 'not applied', 'no'),
    ('disclosure_control', 'none', 'no'),
    ('disclosure_control', 'none required', 'no'),
    ('disclosure_control', 'none needed', 'no'),
    ('disclosure_control', 'not required', 'no'),
    ('disclosure_control', 'no disclosure control applied', 'no'),
    ('disclosure_control', 'no disclosure control required', 'no'),
    ('disclosure_control', 'no disclosure control was required', 'no'),
    ('disclosure_control', 'no disclosure control applied. data source is in the public domain', 'no'),
    ('disclosure_control', 'not applicable', 'not-applicable'),
    ('disclosure_control', 'n/a', 'not-applicable'),
    ('caveats', 'none', 'no'),
    ('caveats', 'n/a', 'no'),
    ('notes', 'none', 'no'),
    ('notes', 'n/a', 'no')
),
answers AS (
  SELECT v.id, p.question, coalesce(vocabulary.answer, 'yes') AS answer
  FROM "indicator_version" v
  CROSS JOIN LATERAL (
    VALUES
      ('disclosure_control', v."disclosure_control_detail"),
      ('caveats', v."caveats_detail"),
      ('notes', v."other_notes_detail")
  ) AS p (question, prose)
  LEFT JOIN vocabulary
    ON vocabulary.question = p.question
    AND vocabulary.prose = regexp_replace(
      lower(btrim(regexp_replace(regexp_replace(p.prose, '<[^>]*>', ' ', 'g'), E'[ \t\r\n]+', ' ', 'g'))),
      '\.$',
      ''
    )
  WHERE p.prose IS NOT NULL
)
UPDATE "indicator_version" v SET
  "disclosure_control" = (
    SELECT answer FROM answers a WHERE a.id = v.id AND a.question = 'disclosure_control'
  ),
  "caveats_needed" = (
    SELECT answer = 'yes' FROM answers a WHERE a.id = v.id AND a.question = 'caveats'
  ),
  "other_notes_needed" = (
    SELECT answer = 'yes' FROM answers a WHERE a.id = v.id AND a.question = 'notes'
  );--> statement-breakpoint
-- The prose that gave an answer other than yes is that answer, so it is not kept as a detail.
UPDATE "indicator_version" SET
  "disclosure_control_detail" = CASE WHEN "disclosure_control" = 'yes' THEN "disclosure_control_detail" END,
  "caveats_detail" = CASE WHEN "caveats_needed" THEN "caveats_detail" END,
  "other_notes_detail" = CASE WHEN "other_notes_needed" THEN "other_notes_detail" END;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_disclosure_control_check" CHECK ("indicator_version"."disclosure_control" IN ('yes', 'no', 'not-applicable'));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_disclosure_control_detail_check" CHECK ("indicator_version"."disclosure_control" IS NOT DISTINCT FROM 'yes' OR "indicator_version"."disclosure_control_detail" IS NULL);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_rounding_detail_check" CHECK ("indicator_version"."rounding_applied" IS TRUE OR "indicator_version"."rounding_detail" IS NULL);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_caveats_detail_check" CHECK ("indicator_version"."caveats_needed" IS TRUE OR "indicator_version"."caveats_detail" IS NULL);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_other_notes_detail_check" CHECK ("indicator_version"."other_notes_needed" IS TRUE OR "indicator_version"."other_notes_detail" IS NULL);--> statement-breakpoint

-- The public surface keeps the details alone: a detail is only held beside a yes.
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
  v.numerator_source_id,
  v.denominator_source_id,
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
