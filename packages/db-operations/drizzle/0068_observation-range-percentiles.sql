ALTER TABLE "observation_range" ADD COLUMN "p25" double precision;--> statement-breakpoint
ALTER TABLE "observation_range" ADD COLUMN "p75" double precision;--> statement-breakpoint
ALTER TABLE "observation_range" ADD COLUMN "quintile_cutoffs" double precision[];--> statement-breakpoint
-- Rebuilt whole, as the read-model rebuild does, so no range a later batch dropped survives.
DELETE FROM observation_range;--> statement-breakpoint
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
    percentile_disc(ARRAY[0.2, 0.4, 0.6, 0.8]) WITHIN GROUP (ORDER BY ro.value) AS quintiles,
    count(*) AS n
  FROM range_observations ro
  GROUP BY ro.indicator_id, ro.display_group, ro.from_date, ro.to_date, ro.segment
)
SELECT
  indicator_id, display_group, from_date, to_date, segment, min, max,
  quartiles[1], quartiles[2],
  -- Each cutoff is the value at rank ceil(n × fifth). Tied values stay in the group
  -- of their first rank because the chart advances only past a cutoff.
  CASE WHEN n >= 5 THEN quintiles END
FROM distributions;--> statement-breakpoint
CREATE OR REPLACE VIEW published.observation_range AS
SELECT orng.indicator_id, orng.display_group, orng.from_date, orng.to_date, orng.segment, orng.min, orng.max,
       orng.p25, orng.p75, orng.quintile_cutoffs
FROM observation_range orng
WHERE orng.indicator_id = ANY (ARRAY(
  SELECT indicator_id FROM indicator_version WHERE status = 'published'
));
