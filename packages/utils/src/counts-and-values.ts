import { VALUE_TYPE_IDS } from './value-type-and-unit.ts';

/** What a count, or the value of a proportion, mean, median, gap or index, measures. */
export const MEASURES = [
  'pounds',
  'admissions',
  'adults',
  'births',
  'cases',
  'casualties',
  'children',
  'days',
  'deaths',
  'diagnoses',
  'households',
  'incidences',
  'minutes',
  'organisations',
  'people',
  'percentage-points',
  'person-years',
  'tests',
  'vaccinations',
  'years',
  'other',
] as const;

export type Measure = (typeof MEASURES)[number];

export const MEASURE_LABELS: Readonly<Record<Measure, string>> = {
  pounds: '£',
  admissions: 'admissions',
  adults: 'adults',
  births: 'births',
  cases: 'cases',
  casualties: 'casualties',
  children: 'children',
  days: 'days',
  deaths: 'deaths',
  diagnoses: 'diagnoses',
  households: 'households',
  incidences: 'incidences',
  minutes: 'minutes',
  organisations: 'organisations',
  people: 'people',
  'percentage-points': 'percentage points',
  'person-years': 'person years',
  tests: 'tests',
  vaccinations: 'vaccinations',
  years: 'years',
  other: 'Other',
};

/** The number a rate is per. */
export const RATE_PERS = [1, 10, 100, 1000, 10000, 100000, 1000000, 1000000000] as const;

export type RatePer = (typeof RATE_PERS)[number];

export const RATE_PER_LABELS: Readonly<Record<RatePer, string>> = {
  1: '1',
  10: '10',
  100: '100',
  1000: '1,000',
  10000: '10,000',
  100000: '100,000',
  1000000: 'million',
  1000000000: 'billion',
};

/** What a rate is per. */
export const RATE_OBJECTS = [
  'bed-days',
  'capita',
  'days',
  'expected-deaths',
  'expected-incidences',
  'people',
  'person-years',
  'smokers-aged-16-plus',
  'smokers-aged-18-plus',
  're-offender',
  'star-pu',
  'vehicle-miles',
  'other',
] as const;

export type RateObject = (typeof RATE_OBJECTS)[number];

export const RATE_OBJECT_LABELS: Readonly<Record<RateObject, string>> = {
  'bed-days': 'bed-days',
  capita: 'capita',
  days: 'days',
  'expected-deaths': 'expected deaths',
  'expected-incidences': 'expected incidences',
  people: 'people',
  'person-years': 'person years',
  'smokers-aged-16-plus': 'smokers aged 16+',
  'smokers-aged-18-plus': 'smokers aged 18+',
  're-offender': 're-offender',
  'star-pu': 'STAR-PU',
  'vehicle-miles': 'vehicle miles',
  other: 'Other',
};

/** What a gap is the difference of, as in "[number] percentage points between employment rates". */
export const GAP_OBJECTS = ['employment-rates', 'life-expectancies', 'other'] as const;

export type GapObject = (typeof GAP_OBJECTS)[number];

export const GAP_OBJECT_LABELS: Readonly<Record<GapObject, string>> = {
  'employment-rates': 'employment rates',
  'life-expectancies': 'life expectancies',
  other: 'Other',
};

/** Whether a ratio is shown as a number or as a percentage. */
export const RATIO_FORMATS = ['number', 'percentage'] as const;

export type RatioFormat = (typeof RATIO_FORMATS)[number];

export const RATIO_FORMAT_LABELS: Readonly<Record<RatioFormat, string>> = {
  number: 'Number',
  percentage: 'Percentage',
};

const RATE_TYPES: readonly string[] = [
  VALUE_TYPE_IDS.crudeRate,
  VALUE_TYPE_IDS.directlyStandardisedRate,
  VALUE_TYPE_IDS.indirectlyStandardisedRate,
];
const PROPORTION_TYPES: readonly string[] = [
  VALUE_TYPE_IDS.proportion,
  VALUE_TYPE_IDS.indirectlyStandardisedProportion,
];
const VALUE_MEASURE_TYPES: readonly string[] = [
  VALUE_TYPE_IDS.mean,
  VALUE_TYPE_IDS.median,
  VALUE_TYPE_IDS.gap,
  VALUE_TYPE_IDS.slopeIndexOfInequality,
  VALUE_TYPE_IDS.relativeIndexOfInequality,
];
const YEAR_TYPES: readonly string[] = [
  VALUE_TYPE_IDS.lifeExpectancy,
  VALUE_TYPE_IDS.healthyLifeExpectancy,
];

/** The questions after the value type that the value type, and the answers before, ask. */
export interface CountsAndValuesQuestions {
  hasCount: boolean;
  /** What the count is measuring, and whether it is an estimate. */
  countMeasure: boolean;
  /** The number and the object a rate is per. */
  rate: boolean;
  valueSameAsCount: boolean;
  valueMeasure: boolean;
  gapObject: boolean;
  ratioFormat: boolean;
}

/** The answers that decide which questions follow the value type. */
export interface CountsAndValuesChoices {
  valueTypeId: string | null;
  hasCount: boolean | null;
  valueSameAsCount: boolean | null;
}

/** Which questions follow the value type, given it and the answers so far. */
export function countsAndValuesQuestions({
  valueTypeId,
  hasCount,
  valueSameAsCount,
}: CountsAndValuesChoices): CountsAndValuesQuestions {
  const valueType = valueTypeId ?? '';
  const isProportion = PROPORTION_TYPES.includes(valueType);
  const asksHasCount =
    RATE_TYPES.includes(valueType) ||
    isProportion ||
    valueType === VALUE_TYPE_IDS.indirectlyStandardisedRatio ||
    valueType === VALUE_TYPE_IDS.ratio;

  return {
    hasCount: asksHasCount,
    countMeasure: valueType === VALUE_TYPE_IDS.count || (asksHasCount && hasCount === true),
    rate: RATE_TYPES.includes(valueType),
    valueSameAsCount: isProportion && hasCount === true,
    // With no count there is nothing for the value to be the same as, so it is asked outright.
    valueMeasure:
      VALUE_MEASURE_TYPES.includes(valueType) ||
      (isProportion && (hasCount === false || valueSameAsCount === false)),
    gapObject: valueType === VALUE_TYPE_IDS.gap,
    ratioFormat: valueType === VALUE_TYPE_IDS.ratio,
  };
}

/** The answers about an indicator's counts and values, as the draft holds them. */
export interface CountsAndValues extends CountsAndValuesChoices {
  countMeasure: Measure | null;
  countMeasureDetail: string | null;
  ratePer: RatePer | null;
  rateObject: RateObject | null;
  rateObjectDetail: string | null;
  valueMeasure: Measure | null;
  valueMeasureDetail: string | null;
  gapObject: GapObject | null;
  gapObjectDetail: string | null;
  ratioFormat: RatioFormat | null;
}

/** Where a phrase puts the number, as in "[number] admissions per 100,000 people". */
export const NUMBER_PLACEHOLDER = '[number]';

/** A choice from a list by its label, or the publisher's own words under "Other". */
function named<Choice extends string>(
  choice: Choice | null,
  detail: string | null,
  labels: Readonly<Record<Choice, string>>,
): string | null {
  if (choice === null) return null;
  return choice === 'other' ? detail : labels[choice];
}

/** A number of what is measured. Pounds go before the number and everything else after it. */
function measured(measure: string | null): string | null {
  if (measure === null) return null;
  return measure === MEASURE_LABELS.pounds
    ? `£${NUMBER_PLACEHOLDER}`
    : `${NUMBER_PLACEHOLDER} ${measure}`;
}

/**
 * The counts of an indicator, such as "[number] people", or null when it has none of its own. A
 * count and a value that are the same thing, as for the Count value type, are written once, as the
 * values.
 */
export function countsPhrase(answers: CountsAndValues): string | null {
  if (
    answers.valueTypeId === VALUE_TYPE_IDS.count ||
    answers.valueTypeId === VALUE_TYPE_IDS.indirectlyStandardisedRatio ||
    !countsAndValuesQuestions(answers).countMeasure
  ) {
    return null;
  }
  return measured(named(answers.countMeasure, answers.countMeasureDetail, MEASURE_LABELS));
}

/**
 * The values of an indicator, such as "[number] admissions per 100,000 people" or "[number]% of
 * people", or null when it has no value type. An answer the phrase needs but the draft lacks is
 * left out, so an indicator imported with only some of the answers still reads sensibly.
 */
export function valuesPhrase(answers: CountsAndValues): string | null {
  const valueType = answers.valueTypeId;
  if (valueType === null) return null;

  const countMeasure = named(answers.countMeasure, answers.countMeasureDetail, MEASURE_LABELS);
  const valueMeasure = named(answers.valueMeasure, answers.valueMeasureDetail, MEASURE_LABELS);
  const counted = answers.hasCount === true ? measured(countMeasure) : null;

  if (valueType === VALUE_TYPE_IDS.count) return measured(countMeasure) ?? NUMBER_PLACEHOLDER;
  if (valueType === VALUE_TYPE_IDS.indirectlyStandardisedRatio) {
    return counted ?? NUMBER_PLACEHOLDER;
  }
  if (YEAR_TYPES.includes(valueType)) return `${NUMBER_PLACEHOLDER} years`;
  if (RATE_TYPES.includes(valueType)) {
    const object = named(answers.rateObject, answers.rateObjectDetail, RATE_OBJECT_LABELS);
    const per =
      answers.ratePer === null || answers.ratePer === 1 ? [] : [RATE_PER_LABELS[answers.ratePer]];
    const perWhat = [...per, ...(object === null ? [] : [object])];
    return [counted ?? NUMBER_PLACEHOLDER, ...(perWhat.length ? ['per', ...perWhat] : [])].join(
      ' ',
    );
  }
  if (valueType === VALUE_TYPE_IDS.gap) {
    const object = named(answers.gapObject, answers.gapObjectDetail, GAP_OBJECT_LABELS);
    const gap = measured(valueMeasure) ?? NUMBER_PLACEHOLDER;
    return object === null ? gap : `${gap} between ${object}`;
  }
  if (VALUE_MEASURE_TYPES.includes(valueType)) return measured(valueMeasure) ?? NUMBER_PLACEHOLDER;
  if (PROPORTION_TYPES.includes(valueType)) {
    const measure =
      answers.hasCount === true && answers.valueSameAsCount === true ? countMeasure : valueMeasure;
    return measure === null ? `${NUMBER_PLACEHOLDER}%` : `${NUMBER_PLACEHOLDER}% of ${measure}`;
  }
  if (valueType === VALUE_TYPE_IDS.ratio && answers.ratioFormat === 'percentage') {
    return `${NUMBER_PLACEHOLDER}%`;
  }
  return NUMBER_PLACEHOLDER;
}

/**
 * The unit the public reads beside a value: the values phrase without its number, such as "% of
 * people" or "£". Null when the phrase is the number alone, so the value is shown on its own.
 */
export function valuesUnit(answers: CountsAndValues): string | null {
  const unit = valuesPhrase(answers)?.replace(NUMBER_PLACEHOLDER, '').trim();
  return unit ? unit : null;
}

/** Whether every question the value type asks is answered, which the values phrase needs. */
export function countsAndValuesAnswered(answers: CountsAndValues): boolean {
  if (answers.valueTypeId === null) return false;
  const asks = countsAndValuesQuestions(answers);
  const chosen = (choice: string | null, detail: string | null) =>
    choice !== null && (choice !== 'other' || (detail ?? '') !== '');

  return (
    (!asks.hasCount || answers.hasCount !== null) &&
    (!asks.countMeasure || chosen(answers.countMeasure, answers.countMeasureDetail)) &&
    (!asks.rate ||
      (answers.ratePer !== null && chosen(answers.rateObject, answers.rateObjectDetail))) &&
    (!asks.valueSameAsCount || answers.valueSameAsCount !== null) &&
    (!asks.valueMeasure || chosen(answers.valueMeasure, answers.valueMeasureDetail)) &&
    (!asks.gapObject || chosen(answers.gapObject, answers.gapObjectDetail)) &&
    (!asks.ratioFormat || answers.ratioFormat !== null)
  );
}
