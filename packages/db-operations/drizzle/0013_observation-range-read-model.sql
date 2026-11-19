CREATE TABLE "observation_range" (
	"indicator_id" uuid NOT NULL,
	"display_group" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"segment" text NOT NULL,
	"min" double precision NOT NULL,
	"max" double precision NOT NULL,
	CONSTRAINT "observation_range_indicator_id_display_group_from_date_to_date_segment_pk" PRIMARY KEY("indicator_id","display_group","from_date","to_date","segment")
);
--> statement-breakpoint
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
GROUP BY ro.indicator_id, ro.display_group, ro.from_date, ro.to_date, ro.segment;
--> statement-breakpoint
GRANT SELECT ON observation_range TO public_api, internal_api;
