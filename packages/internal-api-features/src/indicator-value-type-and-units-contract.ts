import { z } from '@fphd/config/zod';
import {
  type CountsAndValues,
  countsAndValuesQuestions,
  GAP_OBJECTS,
  type GapObject,
  MEASURES,
  type Measure,
  RATE_OBJECTS,
  RATE_PERS,
  RATIO_FORMATS,
  type RateObject,
  type RatePer,
  type RatioFormat,
} from '@fphd/utils/counts-and-values';
import { STANDARD_POPULATIONS, standardisationOf } from '@fphd/utils/value-type-and-unit';

import { type IndicatorSection, textSection } from './indicator-section-contract.ts';
import { shortText } from './text-contract.ts';

const optionSchema = z.object({ id: z.uuid(), name: z.string().min(1) });

/** Every value type a publisher may choose, in the order the form lists them. */
export const valueTypeAndUnitOptionsSchema = z.object({
  valueTypes: z.array(optionSchema),
});

export type ValueTypeAndUnitOptions = z.infer<typeof valueTypeAndUnitOptionsSchema>;

// The directly standardised rate's other population and the indirectly standardised value
// types' reference population are one answer, asked in two places so each shows without JavaScript.
const fields = z.enum([
  'valueTypeId',
  'standardPopulation',
  'standardPopulationOther',
  'referencePopulation',
  'hasCount',
  'countMeasure',
  'countMeasureDetail',
  'countIsEstimate',
  'ratePer',
  'rateObject',
  'rateObjectDetail',
  'valueSameAsCount',
  'valueMeasure',
  'valueMeasureDetail',
  'gapObject',
  'gapObjectDetail',
  'ratioFormat',
]);

export const SELECT_VALUE_TYPE = 'Select the value type';
export const SELECT_STANDARD_POPULATION = 'Select the standard population used';
export const ENTER_POPULATION =
  'Enter the standard or reference used for the standardisation calculation';

const SELECT_HAS_COUNT = 'Select whether there is a count';
const SELECT_COUNT_MEASURE = 'Select what the count is measuring';
const ENTER_COUNT_MEASURE = 'Enter what the count is measuring';
const SELECT_RATE_PER = 'Select what number the rate or proportion is per';
const SELECT_RATE_OBJECT = 'Select what object the rate or proportion is per';
const ENTER_RATE_OBJECT = 'Enter what the rate or proportion is per';
const SELECT_VALUE_SAME_AS_COUNT =
  'Select whether the value is measuring the same thing as the count';
const SELECT_VALUE_MEASURE = 'Select what the value is measuring';
const ENTER_VALUE_MEASURE = 'Enter what the value is measuring';
const SELECT_GAP_OBJECT = 'Select what object the gap is the difference of';
const ENTER_GAP_OBJECT = 'Enter what object the gap is the difference of';
const SELECT_RATIO_FORMAT = 'Select whether the value is a number or a percentage';

/** A choice from a list, or nothing when the value type does not ask for it. */
function choiceOf(values: readonly string[], error: string) {
  return z.enum(['', ...values] as [string, ...string[]], { error });
}

/** "yes" or "no", or nothing when the value type does not ask. */
function yesNoOrNothing(error: string) {
  return z.enum(['', 'yes', 'no'], { error });
}

/** Whether every field the form sends is text, which the cross-field checks need. */
function answersAsText(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    fields.options.every((field) => typeof (value as Record<string, unknown>)[field] === 'string')
  );
}

/**
 * The follow-ups are required only where the value type, and the answers before them, ask them.
 * The form judges that a value type is chosen; the API also checks that it offers it.
 */
const schema = z
  .object({
    valueTypeId: z.uuid(SELECT_VALUE_TYPE),
    standardPopulation: z.enum(['', ...STANDARD_POPULATIONS], {
      error: SELECT_STANDARD_POPULATION,
    }),
    standardPopulationOther: shortText('Standard or reference population'),
    referencePopulation: shortText('Standard or reference population'),
    hasCount: yesNoOrNothing(SELECT_HAS_COUNT),
    countMeasure: choiceOf(MEASURES, SELECT_COUNT_MEASURE),
    countMeasureDetail: shortText('What the count is measuring'),
    countIsEstimate: z.enum(['', 'yes']),
    ratePer: choiceOf(RATE_PERS.map(String), SELECT_RATE_PER),
    rateObject: choiceOf(RATE_OBJECTS, SELECT_RATE_OBJECT),
    rateObjectDetail: shortText('What the rate or proportion is per'),
    valueSameAsCount: yesNoOrNothing(SELECT_VALUE_SAME_AS_COUNT),
    valueMeasure: choiceOf(MEASURES, SELECT_VALUE_MEASURE),
    valueMeasureDetail: shortText('What the value is measuring'),
    gapObject: choiceOf(GAP_OBJECTS, SELECT_GAP_OBJECT),
    gapObjectDetail: shortText('What object the gap is the difference of'),
    ratioFormat: choiceOf(RATIO_FORMATS, SELECT_RATIO_FORMAT),
  })
  .superRefine(
    (answers, ctx) => {
      const issue = (field: z.infer<typeof fields>, message: string) =>
        ctx.addIssue({ code: 'custom', path: [field], message });
      const unanswered = (field: z.infer<typeof fields>, message: string) => {
        if (answers[field] === '') issue(field, message);
      };
      const otherNeedsDetail = (
        choice: 'countMeasure' | 'rateObject' | 'valueMeasure' | 'gapObject',
        detail: z.infer<typeof fields>,
        message: string,
      ) => {
        if (answers[choice] === 'other') unanswered(detail, message);
      };
      const standardisation = standardisationOf(answers.valueTypeId);
      const asks = countsAndValuesQuestions(countsAndValuesChoices(answers));

      if (standardisation === 'direct') {
        unanswered('standardPopulation', SELECT_STANDARD_POPULATION);
        if (answers.standardPopulation === 'other') {
          unanswered('standardPopulationOther', ENTER_POPULATION);
        }
      }
      if (standardisation === 'indirect') unanswered('referencePopulation', ENTER_POPULATION);
      if (asks.hasCount) unanswered('hasCount', SELECT_HAS_COUNT);
      if (asks.countMeasure) {
        unanswered('countMeasure', SELECT_COUNT_MEASURE);
        otherNeedsDetail('countMeasure', 'countMeasureDetail', ENTER_COUNT_MEASURE);
      }
      if (asks.rate) {
        unanswered('ratePer', SELECT_RATE_PER);
        unanswered('rateObject', SELECT_RATE_OBJECT);
        otherNeedsDetail('rateObject', 'rateObjectDetail', ENTER_RATE_OBJECT);
      }
      if (asks.valueSameAsCount) unanswered('valueSameAsCount', SELECT_VALUE_SAME_AS_COUNT);
      if (asks.valueMeasure) {
        unanswered('valueMeasure', SELECT_VALUE_MEASURE);
        otherNeedsDetail('valueMeasure', 'valueMeasureDetail', ENTER_VALUE_MEASURE);
      }
      if (asks.gapObject) {
        unanswered('gapObject', SELECT_GAP_OBJECT);
        otherNeedsDetail('gapObject', 'gapObjectDetail', ENTER_GAP_OBJECT);
      }
      if (asks.ratioFormat) unanswered('ratioFormat', SELECT_RATIO_FORMAT);
    },
    // Also beside an unanswered value type, a choice not offered or text too long, so every
    // refusal shows at once. Only answers the checks can read as text are checked.
    { when: ({ value }) => answersAsText(value) },
  );

/** A yes or no from the form as the answer it stands for, or null when it is unanswered. */
export function yesNoChoice(answer: string): boolean | null {
  if (answer === '') return null;
  return answer === 'yes';
}

/** The answers on the form that decide which of its questions follow the value type. */
export function countsAndValuesChoices(answers: {
  valueTypeId: string;
  hasCount: string;
  valueSameAsCount: string;
}) {
  return {
    valueTypeId: answers.valueTypeId === '' ? null : answers.valueTypeId,
    hasCount: yesNoChoice(answers.hasCount),
    valueSameAsCount: yesNoChoice(answers.valueSameAsCount),
  };
}

/** A choice the form sent, or null when it sent none. */
function chosen<Choice extends string>(choice: string): Choice | null {
  return choice === '' ? null : (choice as Choice);
}

/** The words under a chosen "Other", and nothing beside any other choice. */
function otherDetail(choice: string, detail: string): string | null {
  return choice === 'other' ? detail : null;
}

/**
 * The answers about the counts and values as the form holds them, keeping only those the value
 * type and the answers before them ask, whatever else the form sent. The page builds its preview
 * from them and the draft stores them.
 */
export function countsAndValuesOf(
  answers: Record<CountsAndValuesField, string>,
): CountsAndValues & { countIsEstimate: boolean | null } {
  const choices = countsAndValuesChoices(answers);
  const asks = countsAndValuesQuestions(choices);
  const countMeasure = asks.countMeasure ? answers.countMeasure : '';
  const rateObject = asks.rate ? answers.rateObject : '';
  const valueMeasure = asks.valueMeasure ? answers.valueMeasure : '';
  const gapObject = asks.gapObject ? answers.gapObject : '';

  return {
    valueTypeId: choices.valueTypeId,
    hasCount: asks.hasCount ? choices.hasCount : null,
    countMeasure: chosen<Measure>(countMeasure),
    countMeasureDetail: otherDetail(countMeasure, answers.countMeasureDetail),
    countIsEstimate: asks.countMeasure ? answers.countIsEstimate === 'yes' : null,
    ratePer: asks.rate && answers.ratePer !== '' ? (Number(answers.ratePer) as RatePer) : null,
    rateObject: chosen<RateObject>(rateObject),
    rateObjectDetail: otherDetail(rateObject, answers.rateObjectDetail),
    valueSameAsCount: asks.valueSameAsCount ? choices.valueSameAsCount : null,
    valueMeasure: chosen<Measure>(valueMeasure),
    valueMeasureDetail: otherDetail(valueMeasure, answers.valueMeasureDetail),
    gapObject: chosen<GapObject>(gapObject),
    gapObjectDetail: otherDetail(gapObject, answers.gapObjectDetail),
    ratioFormat: asks.ratioFormat ? chosen<RatioFormat>(answers.ratioFormat) : null,
  };
}

export type ValueTypeAndUnitsField = z.infer<typeof fields>;

/** The fields after the value type that ask about the counts and values. */
type CountsAndValuesField = Exclude<
  ValueTypeAndUnitsField,
  'standardPopulation' | 'standardPopulationOther' | 'referencePopulation'
>;

export type ValueTypeAndUnits = z.infer<typeof schema>;

export const valueTypeAndUnitsSection: IndicatorSection<ValueTypeAndUnitsField, ValueTypeAndUnits> =
  textSection({ key: 'value-type-and-units', fields, schema });
