/** The two halves of a calculation, each of which names where its data comes from. */
export const INDICATOR_CALCULATION_PARTS = ['numerator', 'denominator'] as const;

export type IndicatorCalculationPart = (typeof INDICATOR_CALCULATION_PARTS)[number];

/**
 * What a version's provider and source is for: the numerator, the denominator, or one of the
 * data values an indicator with neither describes instead.
 */
export const INDICATOR_SOURCE_PARTS = [...INDICATOR_CALCULATION_PARTS, 'data-value'] as const;

export type IndicatorSourcePart = (typeof INDICATOR_SOURCE_PARTS)[number];
