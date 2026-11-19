-- Uploaded names are matched to these with whitespace tidied: trimmed, each run of whitespace one
-- space, whitespace being JavaScript's \s as tidyName in @fphd/utils writes it out. Every name
-- takes that form, and rows whose names differ only in whitespace merge into the lowest id.
CREATE FUNCTION pg_temp.tidy_name(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(
    regexp_replace(name, '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g'),
    ' '
  )
$$;--> statement-breakpoint
CREATE TEMP TABLE tidy_dimension_type AS
SELECT
  id,
  dimension_class,
  is_required,
  tidy_name,
  first_value(id) OVER (PARTITION BY tidy_name ORDER BY id) AS survivor_id
FROM (SELECT *, pg_temp.tidy_name(name) AS tidy_name FROM dimension_type) named;--> statement-breakpoint
-- A merged type's values merge into the survivor's value of the same name.
CREATE TEMP TABLE tidy_dimension_value AS
SELECT
  dv.id,
  dv.dimension_type_id,
  t.survivor_id AS survivor_type_id,
  pg_temp.tidy_name(dv.name) AS tidy_name,
  NULL::uuid AS survivor_id
FROM dimension_value dv
JOIN tidy_dimension_type t ON t.id = dv.dimension_type_id;--> statement-breakpoint
UPDATE tidy_dimension_value v
SET survivor_id = s.id
FROM tidy_dimension_value s
WHERE s.dimension_type_id = v.survivor_type_id
  AND s.tidy_name = v.tidy_name;--> statement-breakpoint
CREATE TEMP TABLE tidy_note_type AS
SELECT id, category, tidy_text, first_value(id) OVER (PARTITION BY tidy_text ORDER BY id) AS survivor_id
FROM (SELECT id, category, pg_temp.tidy_name(text) AS tidy_text FROM note_type) named;--> statement-breakpoint
-- Stops, naming the rows, rather than guess at a merge the names alone cannot settle.
DO $$
DECLARE
  found text;
BEGIN
  SELECT string_agg(tidy_name, ', ') INTO found FROM (
    SELECT tidy_name FROM tidy_dimension_type GROUP BY tidy_name
    HAVING count(DISTINCT dimension_class) > 1 OR count(DISTINCT is_required) > 1
  ) mixed;
  IF found IS NOT NULL THEN
    RAISE EXCEPTION 'Dimension types differing only in whitespace have different classes or requirements: %', found;
  END IF;
  SELECT string_agg(tidy_name, ', ') INTO found FROM (
    SELECT tidy_name FROM tidy_dimension_value
    GROUP BY dimension_type_id, tidy_name HAVING count(*) > 1
  ) clashing;
  IF found IS NOT NULL THEN
    RAISE EXCEPTION 'Two values of one dimension type differ only in whitespace: %', found;
  END IF;
  SELECT string_agg(tidy_name, ', ') INTO found
  FROM tidy_dimension_value WHERE survivor_id IS NULL;
  IF found IS NOT NULL THEN
    RAISE EXCEPTION 'A dimension type merging into another has a value the other lacks: %', found;
  END IF;
  SELECT string_agg(observation_id::text, ', ') INTO found FROM (
    SELECT od.observation_id FROM observation_dimension od
    JOIN tidy_dimension_value v ON v.id = od.dimension_value_id
    WHERE v.survivor_type_id IN (SELECT survivor_id FROM tidy_dimension_type WHERE id <> survivor_id)
    GROUP BY od.observation_id, v.survivor_type_id HAVING count(*) > 1
  ) doubled;
  IF found IS NOT NULL THEN
    RAISE EXCEPTION 'An observation has a value in two dimension types that merge: %', found;
  END IF;
  SELECT string_agg(tidy_text, ', ') INTO found FROM (
    SELECT tidy_text FROM tidy_note_type GROUP BY tidy_text HAVING count(DISTINCT category) > 1
  ) mixed;
  IF found IS NOT NULL THEN
    RAISE EXCEPTION 'Note types differing only in whitespace have different categories: %', found;
  END IF;
END
$$;--> statement-breakpoint
UPDATE observation_dimension od
SET dimension_value_id = v.survivor_id, dimension_type_id = v.survivor_type_id
FROM tidy_dimension_value v
WHERE od.dimension_value_id = v.id AND v.id <> v.survivor_id;--> statement-breakpoint
UPDATE dimension_value dv
SET parent_id = v.survivor_id
FROM tidy_dimension_value v
WHERE dv.parent_id = v.id AND v.id <> v.survivor_id;--> statement-breakpoint
DELETE FROM dimension_value
WHERE id IN (SELECT id FROM tidy_dimension_value WHERE id <> survivor_id);--> statement-breakpoint
DELETE FROM dimension_type
WHERE id IN (SELECT id FROM tidy_dimension_type WHERE id <> survivor_id);--> statement-breakpoint
UPDATE dimension_type dt
SET name = t.tidy_name
FROM tidy_dimension_type t
WHERE dt.id = t.id AND dt.name <> t.tidy_name;--> statement-breakpoint
UPDATE dimension_value dv
SET name = v.tidy_name
FROM tidy_dimension_value v
WHERE dv.id = v.id AND dv.name <> v.tidy_name;--> statement-breakpoint
-- An observation noted with two of a merging set keeps the lowest-id row.
DELETE FROM observation_note
WHERE id IN (
  SELECT id FROM (
    SELECT
      n.id,
      row_number() OVER (PARTITION BY n.observation_id, m.survivor_id ORDER BY n.id) AS position
    FROM observation_note n
    JOIN tidy_note_type m ON m.id = n.note_type_id
    WHERE m.survivor_id IN (SELECT survivor_id FROM tidy_note_type WHERE id <> survivor_id)
  ) ranked
  WHERE position > 1
);--> statement-breakpoint
UPDATE observation_note n
SET note_type_id = m.survivor_id
FROM tidy_note_type m
WHERE n.note_type_id = m.id AND m.id <> m.survivor_id;--> statement-breakpoint
DELETE FROM note_type
WHERE id IN (SELECT id FROM tidy_note_type WHERE id <> survivor_id);--> statement-breakpoint
UPDATE note_type n
SET text = m.tidy_text
FROM tidy_note_type m
WHERE n.id = m.id AND n.text <> m.tidy_text;--> statement-breakpoint
-- The read models carrying dimension names are rebuilt by the queries in src/read-models.ts.
DELETE FROM indicator_dimension_values;--> statement-breakpoint
INSERT INTO indicator_dimension_values
  (indicator_id, dimension_type_id, dimension_type_name,
   dimension_value_id, dimension_value_name, sort_order)
SELECT DISTINCT o.indicator_id, dt.id, dt.name, dv.id, dv.name, dv.sort_order
FROM observation o
JOIN observation_dimension od ON od.observation_id = o.id
JOIN dimension_value dv ON dv.id = od.dimension_value_id
JOIN dimension_type dt ON dt.id = dv.dimension_type_id
WHERE o.deleted_at IS NULL;--> statement-breakpoint
DELETE FROM observation_range;--> statement-breakpoint
INSERT INTO observation_range
  (indicator_id, display_group, from_date, to_date, segment, min, max)
WITH range_observations AS (
  SELECT
    o.indicator_id,
    at.display_group,
    o.from_date,
    o.to_date,
    o.value,
    coalesce(
      string_agg(dv.name, '|' ORDER BY dt.name COLLATE "C"),
      ''
    ) AS segment
  FROM observation o
  JOIN area a ON a.id = o.area_id
  JOIN area_type at ON at.id = a.area_type_id
  LEFT JOIN observation_dimension od ON od.observation_id = o.id
  LEFT JOIN dimension_type dt ON dt.id = od.dimension_type_id
  LEFT JOIN dimension_value dv ON dv.id = od.dimension_value_id
  WHERE o.deleted_at IS NULL
    AND o.value IS NOT NULL
    AND at.display_group IS NOT NULL
  GROUP BY o.id, o.indicator_id, at.display_group, o.from_date, o.to_date, o.value
)
SELECT
  ro.indicator_id,
  ro.display_group,
  ro.from_date,
  ro.to_date,
  ro.segment,
  min(ro.value),
  max(ro.value)
FROM range_observations ro
GROUP BY ro.indicator_id, ro.display_group, ro.from_date, ro.to_date, ro.segment;--> statement-breakpoint
ANALYZE indicator_dimension_values;--> statement-breakpoint
ANALYZE observation_range;--> statement-breakpoint
-- Added last, so its lock is not held across the rebuild.
ALTER TABLE "note_type" ADD CONSTRAINT "note_type_text_unique" UNIQUE("text");--> statement-breakpoint
DROP TABLE tidy_dimension_type, tidy_dimension_value, tidy_note_type;--> statement-breakpoint
DROP FUNCTION pg_temp.tidy_name(text);
