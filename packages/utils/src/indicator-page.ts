/**
 * The questions the public indicator page needs answered that a draft may not have answered
 * yet, each a field of the indicator's detail. A preview shows a placeholder for each one its
 * draft leaves unanswered.
 */
export const INDICATOR_QUESTIONS = [
  'valueType',
  'unit',
  'polarity',
  'updateFrequency',
  'timePeriods',
] as const;

export type IndicatorQuestion = (typeof INDICATOR_QUESTIONS)[number];

/**
 * Whether a preview can show a draft's data: it has none uploaded, its data has no read models
 * yet, its data is ready, or the user may see only its metadata.
 */
export const INDICATOR_DATA_STATES = [
  'no-upload',
  'read-models-missing',
  'ready',
  'metadata-only',
] as const;

export type IndicatorDataState = (typeof INDICATOR_DATA_STATES)[number];
