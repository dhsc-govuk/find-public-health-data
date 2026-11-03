export const CORE_REFERENCE_TABLES = [
  'area_type',
  'dimension_type',
  'dimension_value',
  'note_type',
] as const;

export const GEOGRAPHY_CORE_TABLES = ['area', 'area_relationship'] as const;

// Source CSVs in foreign-key order. Core catalog files provide source-to-core id maps.
export const SEED_TABLES = [
  'ci_method',
  'comparator_method',
  'data_source',
  'numerator_denominator_source',
  'dimension_type',
  'dimension_value',
  'area_type',
  'area',
  'area_relationship',
  'indicator',
  'indicator_version',
  'upload_batch',
  'note_type',
  'observation',
  'observation_dimension',
  'observation_note',
] as const;
