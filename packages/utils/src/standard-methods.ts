import { VALUE_TYPE_IDS } from './value-type-and-unit.ts';

/**
 * A method's standard description: the text that says how a value of its type, or a confidence
 * interval of its method, is calculated when the publisher follows the standard method. A method
 * without one has a null description, and the publisher guidance shows `NO_STANDARD_METHOD` in its
 * place.
 */
export interface StandardMethod {
  readonly name: string;
  readonly description: string | null;
}

export const NO_STANDARD_METHOD = 'No standard method available';

/** A value type's standard calculation method, named as the value type is. */
export interface StandardCalculationMethod extends StandardMethod {
  readonly valueTypeId: string;
}

/** The standard calculation method for each value type. */
export const STANDARD_CALCULATION_METHODS: readonly StandardCalculationMethod[] = [
  {
    valueTypeId: VALUE_TYPE_IDS.count,
    name: 'Count',
    description: 'Value and count are the same.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.crudeRate,
    name: 'Crude rate',
    description:
      'The numerator is divided by the denominator. This can then be multiplied by a factor for presentation.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.directlyStandardisedRate,
    name: 'Directly standardised rate',
    description:
      'In each age group, the numerator is divided by the denominator to calculate age specific rates. These age specific rates are multiplied by the standard population for each subgroup respectively. This is then aggregated across all the age groups to give the age adjusted count of events for the area. This is then divided by the total standard population for the whole age range included in the indicator to calculate the age standardised rate for the area. This can then be multiplied by a factor for presentation.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.gap,
    name: 'Gap',
    description: 'The difference between two values, calculated by subtracting one from the other.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.healthyLifeExpectancy,
    name: 'Healthy life expectancy',
    description:
      'Calculated using a standard abridged life table approach. This approach is based on deaths and population broken down by age, together with prevalence of self-reported ‘not good’ health.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.indirectlyStandardisedProportion,
    name: 'Indirectly standardised proportion',
    description: 'Calculated using an odds ratio of the observed and expected odds of an event.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.indirectlyStandardisedRate,
    name: 'Indirectly standardised rate',
    description:
      'Calculated by applying a set of age-specific reference rates (for example England rates) to the age-specific denominators to give ‘expected’ age-specific numerators. These are summed to give an overall expected number of events. The observed count of events is divided by the expected number and multiplied by the overall reference rate (for example the England crude rate for all ages). This can then be multiplied by a factor for presentation.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.indirectlyStandardisedRatio,
    name: 'Indirectly standardised ratio',
    description:
      'Calculated by applying a set of age-specific reference rates (for example England rates) to the age-specific denominators to give ‘expected’ age-specific numerators. These are summed to give an overall expected number of events. The observed count of events is divided by the expected number to give a ratio. This can then be multiplied by a factor for presentation.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.lifeExpectancy,
    name: 'Life expectancy',
    description:
      'Calculated using a standard abridged life table approach. This is based on deaths and population broken down by age.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.mean,
    name: 'Mean',
    description: 'Calculated by dividing the sum of the values by the number of values.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.median,
    name: 'Median',
    description:
      'The middle value in a range. If the number of values is even, the two middle values are summed and the result divided by two.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.proportion,
    name: 'Proportion',
    description:
      'The numerator is divided by the denominator. It can then be multiplied by 100 to be presented as a percentage.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.ratio,
    name: 'Ratio',
    description: 'The numerator is divided by the denominator.',
  },
  {
    valueTypeId: VALUE_TYPE_IDS.relativeIndexOfInequality,
    name: 'Relative index of inequality',
    description:
      'Calculated by fitting a regression model to values across a range of deprivation measures. Giving an estimated ratio between the most and least deprived populations.',
  },
  { valueTypeId: VALUE_TYPE_IDS.score, name: 'Score', description: null },
  {
    valueTypeId: VALUE_TYPE_IDS.slopeIndexOfInequality,
    name: 'Slope index of inequality',
    description:
      'Calculated by fitting a regression model to values across a range of deprivation measures. Giving an estimated gap between the most and least deprived populations.',
  },
];

/**
 * The standard description of how a value of the type is calculated, or null for a value type
 * with no standard method, such as Score, or one the list does not name.
 */
export function standardCalculationMethodOf(valueTypeId: string): string | null {
  return (
    STANDARD_CALCULATION_METHODS.find((method) => method.valueTypeId === valueTypeId)
      ?.description ?? null
  );
}

/** What a confidence interval is, which every confidence interval method's description builds on. */
export const CONFIDENCE_INTERVAL_DESCRIPTION =
  'A confidence interval is a range of values that shows how imprecise an indicator value is. This imprecision is due to random variation in the measurement of that value. A wider confidence interval shows that an indicator value is likely to be a less precise estimate of the true underlying value.';

/** The standard description of each confidence interval method, by the method's name. */
export const STANDARD_CONFIDENCE_INTERVAL_METHODS: readonly StandardMethod[] = [
  {
    name: "Byar's method",
    description:
      'Byar’s method gives very accurate approximate confidence intervals for counts based on the assumption of a Poisson distribution. It is sufficiently accurate for counts as low as 10. Below 10, an exact method should be used, based on Poisson tables or the Chi-squared distribution.',
  },
  {
    name: "Byar's method (adjusted for repeat hospital admissions)",
    description:
      'Byar’s method gives very accurate approximate confidence intervals for counts based on the assumption of a Poisson distribution. It is sufficiently accurate for counts as low as 10. Below 10, an exact method should be used, based on Poisson tables or the Chi-squared distribution.',
  },
  {
    name: 'Chiang-Silcocks method',
    description:
      "Chiang's method, with Silcocks' modification, gives approximate confidence intervals for life expectancy.",
  },
  {
    name: "Dobson & Byar's methods",
    description:
      'Dobson & Byar’s method is used for calculating confidence intervals for directly standardised rates. A confidence interval is calculated for the observed total count of events using Byar’s method. This gives very accurate approximate confidence intervals for counts based on the assumption of a Poisson distribution. It is sufficiently accurate for counts as low as 10. This interval is then weighted and scaled to give the interval for the standardised rate using the method described by Dobson.',
  },
  {
    name: 'Exact Poisson method',
    description:
      'The exact Poisson method gives accurate confidence intervals for counts and crude rates for any values. It is specifically required where the numerator is very small.',
  },
  {
    name: 'Newcombe-Wilson method',
    description:
      'The Newcombe-Wilson method is used for calculating confidence intervals for the difference between two independent proportions. It is calculated by combining the Wilson Score confidence intervals for the two proportions.',
  },
  {
    name: 'No confidence intervals available',
    description:
      'Without confidence intervals it is impossible to know whether differences between values are statistically significant, or likely to be random variation. For some statistics it is not possible to calculate robust confidence intervals, but it is important to consider the extent of variation and try to avoid over-interpreting differences.',
  },
  { name: 'Other method', description: null },
  { name: 'T-distribution method', description: null },
  {
    name: 'Wald normal approximation',
    description:
      'The Wald normal approximation gives approximate confidence intervals for proportions. These are reasonably accurate if the proportion is not close to zero or one. It is not used by the Department of Health and Social Care, but is sometimes presented when indicators have been calculated externally.',
  },
  {
    name: 'Wilson Score method',
    description:
      'The Wilson Score method gives very accurate approximate confidence intervals for proportions and odds based on the assumption of a Binomial distribution. It can be used with any data values, even when the denominator is very small. Unlike some methods, it gives an interval when the numerator count and proportion is zero.',
  },
];
