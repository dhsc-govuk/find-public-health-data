/**
 * The value types whose ids the code behaves on. Every value type is a core data row, listed
 * in `value-types.json` in @fphd/db-operations.
 */
export const VALUE_TYPE_IDS = {
  count: '01a0d8a5-3ca2-7315-bfca-96c7324d4347',
  crudeRate: '01a0d8a5-3ca2-7315-bfca-96c8c77cad18',
  directlyStandardisedRate: '01a0d8a5-3ca2-7315-bfca-96c9664c846c',
  gap: '01a0d8a5-3ca2-7315-bfca-96cb03846bff',
  healthyLifeExpectancy: '01a217b8-441a-7654-b652-f0988bbad8f4',
  indirectlyStandardisedProportion: '01a0d8a5-3ca2-7315-bfca-96cc2dc711c3',
  indirectlyStandardisedRate: '01a217b8-441c-7078-8e42-15fa9781174a',
  indirectlyStandardisedRatio: '01a0d8a5-3ca2-7315-bfca-96cda63ea940',
  lifeExpectancy: '01a0d8a5-3ca2-7315-bfca-96ce5ffc8d47',
  mean: '01a0d8a5-3ca2-7315-bfca-96cff286704d',
  median: '01a0d8a5-3ca2-7315-bfca-96d0928fd186',
  proportion: '01a0d8a5-3ca2-7315-bfca-96d2031a65e7',
  ratio: '01a0d8a5-3ca2-7315-bfca-96d34a17c74b',
  relativeIndexOfInequality: '01a0f31b-a23f-749d-a9ea-68b179920ab3',
  score: '01a0d8a5-3ca2-7315-bfca-96d4cc7f7bcb',
  slopeIndexOfInequality: '01a0d8a5-3ca2-7315-bfca-96d54168d21f',
} as const;

/**
 * The value types calculated from a numerator and a denominator, whose Fingertips count is the
 * numerator. Migration 0052 applied this list to existing rows, so a change to it needs a data
 * migration of its own.
 */
export const NUMERATOR_VALUE_TYPE_IDS: readonly string[] = [
  VALUE_TYPE_IDS.crudeRate,
  VALUE_TYPE_IDS.directlyStandardisedRate,
  VALUE_TYPE_IDS.indirectlyStandardisedProportion,
  VALUE_TYPE_IDS.indirectlyStandardisedRate,
  VALUE_TYPE_IDS.indirectlyStandardisedRatio,
  VALUE_TYPE_IDS.proportion,
  VALUE_TYPE_IDS.ratio,
];

/**
 * Fingertips indicators whose count is an estimated number of people, such as a survey's
 * prevalence applied to the population, rather than the numerator its value is calculated from.
 * Their count stays a count whatever their value type. Migration 0052 applied this list to
 * existing rows, so an indicator added here needs a data migration moving its numerator back.
 */
export const ESTIMATED_COUNT_INDICATOR_IDS: readonly number[] = [
  92443, // Smoking prevalence in adults, from the Annual Population Survey
];

/** Whether a Fingertips indicator's count is the numerator its value is calculated from. */
export function countIsNumerator(
  valueTypeId: string | null | undefined,
  fingertipsId: number,
): boolean {
  return (
    valueTypeId != null &&
    NUMERATOR_VALUE_TYPE_IDS.includes(valueTypeId) &&
    !ESTIMATED_COUNT_INDICATOR_IDS.includes(fingertipsId)
  );
}

/** The value types standardised against a reference population the publisher names. */
export const INDIRECTLY_STANDARDISED_VALUE_TYPE_IDS: readonly string[] = [
  VALUE_TYPE_IDS.indirectlyStandardisedProportion,
  VALUE_TYPE_IDS.indirectlyStandardisedRate,
  VALUE_TYPE_IDS.indirectlyStandardisedRatio,
];

/** How a value type is standardised, which decides what the form asks of its population. */
export function standardisationOf(valueTypeId: string): 'direct' | 'indirect' | null {
  if (valueTypeId === VALUE_TYPE_IDS.directlyStandardisedRate) return 'direct';
  return INDIRECTLY_STANDARDISED_VALUE_TYPE_IDS.includes(valueTypeId) ? 'indirect' : null;
}

/** The standard population of a directly standardised rate, or one the publisher names. */
export const STANDARD_POPULATIONS = ['esp-2013', 'other'] as const;

export type StandardPopulation = (typeof STANDARD_POPULATIONS)[number];

export const STANDARD_POPULATION_LABELS: Readonly<Record<StandardPopulation, string>> = {
  'esp-2013': '2013 European Standard Population',
  other: 'Other',
};

export interface FingertipsFormatting {
  maximum: number | null;
  decimalPlaces: number | null;
}
