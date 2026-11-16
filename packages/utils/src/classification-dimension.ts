/**
 * Classification dimensions available to indicators.
 */
export const CLASSIFICATION_DIMENSIONS = [
  'indicator_type',
  'population',
  'inequality',
  'framework',
  'life_stage',
  'risk_factor',
] as const;

export type ClassificationDimension = (typeof CLASSIFICATION_DIMENSIONS)[number];

/** The dimensions a publisher tags an indicator with on the tagging page. */
export const TAGGING_DIMENSIONS = [
  'indicator_type',
  'framework',
  'life_stage',
  'risk_factor',
] as const satisfies readonly ClassificationDimension[];

/**
 * The classifications whose ids the code behaves on. Every classification is a core data row,
 * listed in `classifications.json` in @fphd/db-operations.
 */
export const CLASSIFICATION_IDS = {
  publicHealthOutcomesFramework: '01a0edef-f609-758f-8891-079e7e9029dc',
} as const;
