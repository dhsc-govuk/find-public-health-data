ALTER TABLE "observation_range" ADD COLUMN "p25" double precision;--> statement-breakpoint
ALTER TABLE "observation_range" ADD COLUMN "p75" double precision;--> statement-breakpoint
ALTER TABLE "observation_range" ADD COLUMN "quintile_cutoffs" double precision[];--> statement-breakpoint
INSERT INTO observation_range
  (indicator_id, display_group, from_date, to_date, segment, min, max, p25, p75, quintile_cutoffs)
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
  FROM published.observation o
  JOIN published.area a ON a.id = o.area_id
  JOIN published.area_type at ON at.id = a.area_type_id
  LEFT JOIN observation_dimension od ON od.observation_id = o.id
  LEFT JOIN published.dimension_type dt ON dt.id = od.dimension_type_id
  LEFT JOIN published.dimension_value dv ON dv.id = od.dimension_value_id
  WHERE o.value IS NOT NULL
    AND at.display_group IS NOT NULL
  GROUP BY o.id, o.indicator_id, at.display_group, o.from_date, o.to_date, o.value
), distributions AS (
  SELECT
    ro.indicator_id, ro.display_group, ro.from_date, ro.to_date, ro.segment,
    min(ro.value) AS min, max(ro.value) AS max,
    percentile_cont(ARRAY[0.25, 0.75]) WITHIN GROUP (ORDER BY ro.value) AS quartiles,
    array_agg(ro.value ORDER BY ro.value) AS ordered_values,
    count(*) AS n
  FROM range_observations ro
  GROUP BY ro.indicator_id, ro.display_group, ro.from_date, ro.to_date, ro.segment
)
SELECT
  indicator_id, display_group, from_date, to_date, segment, min, max,
  quartiles[1], quartiles[2],
  -- Each cutoff is the last rank before the next fifth. Tied values stay in the
  -- group of their first rank because the chart advances only past a cutoff.
  CASE WHEN n >= 5 THEN ARRAY[
    ordered_values[ceil(n * 0.2)::int],
    ordered_values[ceil(n * 0.4)::int],
    ordered_values[ceil(n * 0.6)::int],
    ordered_values[ceil(n * 0.8)::int]
  ] END
FROM distributions
ON CONFLICT (indicator_id, display_group, from_date, to_date, segment) DO UPDATE SET
  min = excluded.min,
  max = excluded.max,
  p25 = excluded.p25,
  p75 = excluded.p75,
  quintile_cutoffs = excluded.quintile_cutoffs;--> statement-breakpoint
CREATE OR REPLACE VIEW published.observation_range AS
SELECT orng.indicator_id, orng.display_group, orng.from_date, orng.to_date, orng.segment, orng.min, orng.max,
       orng.p25, orng.p75, orng.quintile_cutoffs
FROM observation_range orng
WHERE orng.indicator_id = ANY (ARRAY(
  SELECT indicator_id FROM indicator_version WHERE status = 'published'
));
