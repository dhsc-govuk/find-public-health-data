-- Explicit per-table grants, no ALTER DEFAULT PRIVILEGES: a table added by a future
-- migration gets no access until that migration grants it deliberately.
-- public_api: the published read surface only — no operational upload data.
GRANT SELECT ON
  value_type, unit, year_type, ci_method, polarity, frequency, comparator_method,
  data_source, numerator_denominator_source,
  dimension_type, dimension_value,
  area_type, area, area_relationship,
  indicator, indicator_metadata,
  note_type, observation, observation_dimension, observation_note,
  latest_headline, available_data, indicator_dimension_values
TO public_api;--> statement-breakpoint
-- internal_api additionally sees upload/operational state.
GRANT SELECT ON
  value_type, unit, year_type, ci_method, polarity, frequency, comparator_method,
  data_source, numerator_denominator_source,
  dimension_type, dimension_value,
  area_type, area, area_relationship,
  indicator, indicator_metadata, upload_batch,
  note_type, observation, observation_dimension, observation_note,
  latest_headline, available_data, indicator_dimension_values
TO internal_api;
