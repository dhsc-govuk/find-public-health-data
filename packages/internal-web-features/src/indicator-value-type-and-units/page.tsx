import {
  countsAndValuesOf,
  ENTER_POPULATION,
  type ValueTypeAndUnitOptions,
  type ValueTypeAndUnitsField,
  valueTypeAndUnitsSection,
} from '@fphd/internal-api-features/contract';
import {
  Checkboxes,
  firstCheckboxId,
  firstRadioId,
  Radios,
  Select,
  SummaryList,
  TextInput,
} from '@fphd/ui';
import {
  countsAndValuesAnswered,
  countsAndValuesQuestions,
  countsPhrase,
  GAP_OBJECT_LABELS,
  GAP_OBJECTS,
  MEASURE_LABELS,
  MEASURES,
  RATE_OBJECT_LABELS,
  RATE_OBJECTS,
  RATE_PER_LABELS,
  RATE_PERS,
  RATIO_FORMAT_LABELS,
  RATIO_FORMATS,
  valuesPhrase,
} from '@fphd/utils/counts-and-values';
import {
  INDIRECTLY_STANDARDISED_VALUE_TYPE_IDS,
  STANDARD_POPULATION_LABELS,
  STANDARD_POPULATIONS,
  standardisationOf,
  VALUE_TYPE_IDS,
} from '@fphd/utils/value-type-and-unit';

import type { FormValues } from '../form-values.ts';
import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { useLiveAnswers } from './live-answers.ts';

export const VALUE_TYPE_AND_UNITS_TITLE = 'Value types, counts and units';

const OTHER_HINT = 'Use lowercase letters, except for proper nouns';

type ValueTypeAndUnitsPageProps = SectionPageProps<ValueTypeAndUnitsField> &
  ValueTypeAndUnitOptions;

type ValueTypes = ValueTypeAndUnitOptions['valueTypes'];

const listWithOr = new Intl.ListFormat('en-GB', { type: 'disjunction' });

/** The names of the offered value types among these ids, listed for a hint. */
function namesOf(valueTypes: ValueTypes, ids: readonly string[]): string {
  return listWithOr.format(valueTypes.filter(({ id }) => ids.includes(id)).map(({ name }) => name));
}

function selectOptions(options: readonly { value: string; label: string }[]) {
  return [{ label: 'Select', value: '' }, ...options];
}

function listOptions<Choice extends string | number>(
  choices: readonly Choice[],
  labels: Readonly<Record<Choice, string>>,
) {
  return selectOptions(choices.map((choice) => ({ value: String(choice), label: labels[choice] })));
}

// The value types each follow-up is asked of, named in its hint before the page is hydrated.
const RATE_TYPES = [
  VALUE_TYPE_IDS.crudeRate,
  VALUE_TYPE_IDS.directlyStandardisedRate,
  VALUE_TYPE_IDS.indirectlyStandardisedRate,
];
const PROPORTION_TYPES = [
  VALUE_TYPE_IDS.proportion,
  VALUE_TYPE_IDS.indirectlyStandardisedProportion,
];
const HAS_COUNT_TYPES = [
  ...RATE_TYPES,
  VALUE_TYPE_IDS.indirectlyStandardisedProportion,
  VALUE_TYPE_IDS.indirectlyStandardisedRatio,
  VALUE_TYPE_IDS.proportion,
  VALUE_TYPE_IDS.ratio,
];
const VALUE_MEASURE_TYPES = [
  VALUE_TYPE_IDS.gap,
  VALUE_TYPE_IDS.mean,
  VALUE_TYPE_IDS.median,
  VALUE_TYPE_IDS.relativeIndexOfInequality,
  VALUE_TYPE_IDS.slopeIndexOfInequality,
];

interface ChoiceWithOtherProps {
  choice: 'countMeasure' | 'rateObject' | 'valueMeasure' | 'gapObject';
  detail: 'countMeasureDetail' | 'rateObjectDetail' | 'valueMeasureDetail' | 'gapObjectDetail';
  label: string;
  detailLabel: string;
  options: { value: string; label: string }[];
  form: Pick<ValueTypeAndUnitsPageProps, 'fieldErrors' | 'values'>;
  live: ReturnType<typeof useLiveAnswers<ValueTypeAndUnitsField>>;
  /** The hint naming what the question is for, shown before the page is hydrated. */
  forWhat: string;
}

/** A choice from a list whose "Other" asks for the publisher's own words. */
function ChoiceWithOther({
  choice,
  detail,
  detailLabel,
  forWhat,
  form: { fieldErrors, values },
  label,
  live,
  options,
}: ChoiceWithOtherProps) {
  return (
    <>
      <Select
        {...live.hint(forWhat)}
        defaultValue={values[choice]}
        error={fieldErrors[choice]}
        label={label}
        labelHeading="h2"
        name={choice}
        options={options}
      />
      <div hidden={live.hides(live.values[choice] === 'other')}>
        <TextInput
          className="govuk-input--width-20"
          defaultValue={values[detail]}
          error={fieldErrors[detail]}
          hint={live.enhanced ? OTHER_HINT : `Only needed for Other. ${OTHER_HINT}`}
          label={detailLabel}
          labelHeading="h2"
          name={detail}
        />
      </div>
    </>
  );
}

/** The counts and values phrases, once every question the answers ask is answered. */
function CountsAndValuesPreview({ values }: { values: FormValues<ValueTypeAndUnitsField> }) {
  const answers = countsAndValuesOf(values);
  if (!countsAndValuesAnswered(answers)) return null;

  return (
    <div className="govuk-!-margin-top-8">
      <h2 className="govuk-heading-m">Preview of counts and values</h2>
      <SummaryList
        className="govuk-!-margin-bottom-6"
        items={[
          { name: 'Counts', children: countsPhrase(answers) ?? '-' },
          { name: 'Values', children: valuesPhrase(answers) },
        ]}
      />
    </div>
  );
}

/**
 * Each follow-up is asked only of the value type, and the answers before it, that need it. Without
 * JavaScript every follow-up shows, with a hint naming what it is for, and the API keeps only the
 * answers asked for.
 */
export function ValueTypeAndUnitsPage({ valueTypes, ...form }: ValueTypeAndUnitsPageProps) {
  const { fieldErrors, values } = form;
  const live = useLiveAnswers(valueTypeAndUnitsSection.fields.options, values);
  const standardisation = standardisationOf(live.values.valueTypeId);
  const asks = countsAndValuesQuestions(countsAndValuesOf(live.values));
  const isCount = live.values.valueTypeId === VALUE_TYPE_IDS.count;
  const names = (ids: readonly string[]) => namesOf(valueTypes, ids);

  // A count is asked about inside "Is there a count?", except for the Count value type, which
  // does not ask that question. Moving between the two renders the controls afresh, so they take
  // the answers given so far rather than the saved ones.
  const countMeasure = (
    <div hidden={live.hides(asks.countMeasure)}>
      <ChoiceWithOther
        choice="countMeasure"
        detail="countMeasureDetail"
        detailLabel="Enter what the count is measuring"
        form={{ fieldErrors, values: live.values }}
        forWhat={`Only needed for ${names([VALUE_TYPE_IDS.count])}, or if there is a count`}
        label="What is the count measuring?"
        live={live}
        options={listOptions(MEASURES, MEASURE_LABELS)}
      />
      {/* A single checkbox has no question of its own, so it sits in no fieldset. */}
      <div className="govuk-form-group">
        <div className="govuk-checkboxes">
          <Checkboxes.Item
            defaultChecked={live.values.countIsEstimate === 'yes'}
            id={firstCheckboxId('countIsEstimate')}
            label="Count is an estimate"
            name="countIsEstimate"
            value="yes"
          />
        </div>
      </div>
    </div>
  );

  return (
    <IndicatorSectionForm
      fieldIds={{
        standardPopulation: firstRadioId('standardPopulation'),
        hasCount: firstRadioId('hasCount'),
        valueSameAsCount: firstRadioId('valueSameAsCount'),
        ratioFormat: firstRadioId('ratioFormat'),
      }}
      form={form}
      section={valueTypeAndUnitsSection}
      title={VALUE_TYPE_AND_UNITS_TITLE}
    >
      <div onChange={live.onChange} ref={live.ref}>
        <Select
          defaultValue={values.valueTypeId}
          error={fieldErrors.valueTypeId}
          label="What is the value type?"
          labelHeading="h2"
          name="valueTypeId"
          options={selectOptions(valueTypes.map(({ id, name }) => ({ label: name, value: id })))}
        />
        <div hidden={live.hides(standardisation === 'direct')}>
          <Radios
            {...live.hint(`Only needed for ${names([VALUE_TYPE_IDS.directlyStandardisedRate])}`)}
            defaultValue={values.standardPopulation}
            error={fieldErrors.standardPopulation}
            label="What standard population has been used?"
            labelHeading="h2"
            name="standardPopulation"
            options={STANDARD_POPULATIONS.map((value) => ({
              label: STANDARD_POPULATION_LABELS[value],
              value,
              ...(value === 'other'
                ? {
                    // Shown without JavaScript; with it, only while "Other" is chosen.
                    conditional: (
                      <TextInput
                        {...live.hint('Only needed for Other standard populations')}
                        defaultValue={values.standardPopulationOther}
                        error={fieldErrors.standardPopulationOther}
                        label={ENTER_POPULATION}
                        labelHeading="h3"
                        name="standardPopulationOther"
                      />
                    ),
                  }
                : {}),
            }))}
          />
        </div>
        <div hidden={live.hides(standardisation === 'indirect')}>
          <TextInput
            {...live.hint(`Only needed for ${names(INDIRECTLY_STANDARDISED_VALUE_TYPE_IDS)}`)}
            defaultValue={values.referencePopulation}
            error={fieldErrors.referencePopulation}
            label={ENTER_POPULATION}
            labelHeading="h2"
            name="referencePopulation"
          />
        </div>
        <div hidden={live.hides(asks.hasCount)}>
          <Radios
            {...live.hint(`Only needed for ${names(HAS_COUNT_TYPES)}`)}
            defaultValue={values.hasCount}
            error={fieldErrors.hasCount}
            label="Is there a count?"
            labelHeading="h2"
            name="hasCount"
            options={[
              { value: 'yes', label: 'Yes', conditional: isCount ? null : countMeasure },
              { value: 'no', label: 'No' },
            ]}
          />
        </div>
        {isCount ? countMeasure : null}
        <div hidden={live.hides(asks.rate)}>
          <Select
            {...live.hint(`Only needed for ${names(RATE_TYPES)}`)}
            defaultValue={values.ratePer}
            error={fieldErrors.ratePer}
            label="What number is the rate per?"
            labelHeading="h2"
            name="ratePer"
            options={listOptions(RATE_PERS, RATE_PER_LABELS)}
          />
          <ChoiceWithOther
            choice="rateObject"
            detail="rateObjectDetail"
            detailLabel="Enter what the rate or proportion is per"
            form={form}
            forWhat={`Only needed for ${names(RATE_TYPES)}`}
            label="What object is the rate per?"
            live={live}
            options={listOptions(RATE_OBJECTS, RATE_OBJECT_LABELS)}
          />
        </div>
        <div hidden={live.hides(asks.valueSameAsCount)}>
          <Radios
            {...live.hint(`Only needed for ${names(PROPORTION_TYPES)}, if there is a count`)}
            defaultValue={values.valueSameAsCount}
            error={fieldErrors.valueSameAsCount}
            label="Is the value measuring the same thing as the count?"
            labelHeading="h2"
            name="valueSameAsCount"
            options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ]}
          />
        </div>
        <div hidden={live.hides(asks.valueMeasure)}>
          <ChoiceWithOther
            choice="valueMeasure"
            detail="valueMeasureDetail"
            detailLabel="Enter what the value is measuring"
            form={form}
            forWhat={`Only needed for ${names(VALUE_MEASURE_TYPES)}, or for ${names(PROPORTION_TYPES)} when the value is not measuring the same thing as the count`}
            label="What is the value measuring?"
            live={live}
            options={listOptions(MEASURES, MEASURE_LABELS)}
          />
        </div>
        <div hidden={live.hides(asks.gapObject)}>
          <ChoiceWithOther
            choice="gapObject"
            detail="gapObjectDetail"
            detailLabel="Enter what object the gap is the difference of"
            form={form}
            forWhat={`Only needed for ${names([VALUE_TYPE_IDS.gap])}`}
            label="What object is the gap the difference of?"
            live={live}
            options={listOptions(GAP_OBJECTS, GAP_OBJECT_LABELS)}
          />
        </div>
        <div hidden={live.hides(asks.ratioFormat)}>
          <Radios
            {...live.hint(`Only needed for ${names([VALUE_TYPE_IDS.ratio])}`)}
            defaultValue={values.ratioFormat}
            error={fieldErrors.ratioFormat}
            label="Is the value a number or a percentage?"
            labelHeading="h2"
            name="ratioFormat"
            options={RATIO_FORMATS.map((value) => ({ value, label: RATIO_FORMAT_LABELS[value] }))}
          />
        </div>
        <CountsAndValuesPreview values={live.values} />
      </div>
    </IndicatorSectionForm>
  );
}
