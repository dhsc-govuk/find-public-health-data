import {
  AGE_LIMIT_FIELDS,
  AGE_RANGE_PARTS,
  type AgeLimitBound,
  type AgeRangeFormValues,
  ageLimitLabel,
  ageRangeFieldName,
  DEMOGRAPHIC_LIST_FIELDS,
  MAX_AGE_RANGES,
  type SexAndAgesFormValues,
  type SexAndAgesPageField,
} from '@fphd/internal-api-features/contract';
import {
  Button,
  Checkboxes,
  fieldInputId,
  firstCheckboxId,
  firstRadioId,
  Radios,
  Select,
  TextInput,
} from '@fphd/ui';
import { AGE_UNITS } from '@fphd/utils/sex-and-ages';
import {
  DEMOGRAPHIC_LABELS,
  DEMOGRAPHICS,
  type Demographic,
  ETHNIC_GROUP_LABELS,
  ETHNIC_GROUPS,
  GENDER_LABELS,
  GENDERS,
  SEX_LABELS,
  SEXES,
} from '@fphd/utils/sex-gender-and-ethnicity';
import type { ReactNode } from 'react';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { ADD_INTENT, removeIntent } from '../list-form.ts';

type FieldErrors = Partial<Record<SexAndAgesPageField, string>>;

const TITLE = 'Sex, gender and ethnicity';

function optionsOf<Value extends string>(values: readonly Value[], labels: Record<Value, string>) {
  return values.map((value) => ({ value, label: labels[value] }));
}

/** The question each demographic reveals when it is ticked, asking which ones are included. */
const INCLUDED: Readonly<
  Record<Demographic, { label: string; options: { value: string; label: string }[] }>
> = {
  sex: { label: 'Select included sexes', options: optionsOf(SEXES, SEX_LABELS) },
  gender: { label: 'Select included genders', options: optionsOf(GENDERS, GENDER_LABELS) },
  ethnicity: {
    label: 'Select included ethnic groups',
    options: optionsOf(ETHNIC_GROUPS, ETHNIC_GROUP_LABELS),
  },
};

const UNIT_OPTIONS = [
  { value: '', label: 'Select' },
  ...AGE_UNITS.map((unit) => ({ value: unit, label: unit })),
];

/** Every field in the order the page asks them, which the error summary follows. */
function pageFields(rangeCount: number): SexAndAgesPageField[] {
  return [
    'demographics',
    'sexes',
    'genders',
    'ethnicGroups',
    'ageType',
    'ageRanges',
    ...Array.from({ length: rangeCount }, (_, index) =>
      AGE_RANGE_PARTS.map((part) => ageRangeFieldName(index, part)),
    ).flat(),
    'specificAge',
    'specificAgeUnit',
    'ageDetail',
  ];
}

/** "Periods", saying to screen readers which age it is the unit of, as the page repeats it. */
function periodsLabel(of: string): ReactNode {
  return (
    <>
      Periods<span className="govuk-visually-hidden"> for {of}</span>
    </>
  );
}

function AgeLimit({
  bound,
  index,
  range,
  fieldErrors,
}: {
  bound: AgeLimitBound;
  index: number;
  range: AgeRangeFormValues;
  fieldErrors: FieldErrors;
}) {
  const [valueField, unitField] = AGE_LIMIT_FIELDS[bound];
  const valueName = ageRangeFieldName(index, valueField);
  const unitName = ageRangeFieldName(index, unitField);
  const label = ageLimitLabel(bound, index);

  return (
    <div className="fphd-field-row">
      <TextInput
        autoComplete="off"
        className="govuk-input--width-5"
        defaultValue={range[valueField]}
        error={fieldErrors[valueName]}
        inputMode="numeric"
        label={label}
        name={valueName}
      />
      <Select
        defaultValue={range[unitField]}
        error={fieldErrors[unitName]}
        label={periodsLabel(label.toLowerCase())}
        name={unitName}
        options={UNIT_OPTIONS}
      />
    </div>
  );
}

/** The ranges as typed, each removable but the first, and the button that adds another. */
function AgeRanges({
  ranges,
  fieldErrors,
}: {
  ranges: readonly AgeRangeFormValues[];
  fieldErrors: FieldErrors;
}) {
  return (
    <>
      <p className="govuk-hint">You must enter at least a lower or upper limit</p>
      {ranges.map((range, index) => (
        <div key={index}>
          <AgeLimit bound="lower" fieldErrors={fieldErrors} index={index} range={range} />
          <AgeLimit bound="upper" fieldErrors={fieldErrors} index={index} range={range} />
          {index === 0 ? null : (
            <Button classModifiers="secondary" name="intent" value={removeIntent(index)}>
              {'Remove range'}
              <span className="govuk-visually-hidden"> {index + 1}</span>
            </Button>
          )}
        </div>
      ))}
      {ranges.length < MAX_AGE_RANGES ? (
        <Button
          classModifiers="secondary"
          className="govuk-!-margin-bottom-0"
          name="intent"
          value={ADD_INTENT}
        >
          Add another range
        </Button>
      ) : null}
    </>
  );
}

/** What was collected, each demographic revealing the question of which ones are included. */
function Demographics({
  values,
  fieldErrors,
}: {
  values: SexAndAgesFormValues;
  fieldErrors: FieldErrors;
}) {
  const included = (demographic: Demographic) => {
    const field = DEMOGRAPHIC_LIST_FIELDS[demographic];

    return (
      <Checkboxes
        defaultValue={values[field]}
        error={fieldErrors[field]}
        label={INCLUDED[demographic].label}
        name={field}
        options={INCLUDED[demographic].options}
      />
    );
  };

  return (
    <Checkboxes
      defaultValue={values.demographics}
      error={fieldErrors.demographics}
      hint="Select all that apply"
      label="What was collected for this indicator?"
      labelHeading="h2"
      name="demographics"
      // Each list is shown without JavaScript. With it, a list shows only while its demographic
      // is ticked.
      options={DEMOGRAPHICS.map((demographic) => ({
        value: demographic,
        label: DEMOGRAPHIC_LABELS[demographic],
        conditional: included(demographic),
      }))}
    />
  );
}

export function SexAndAgesPage(form: SectionPageProps<SexAndAgesPageField, SexAndAgesFormValues>) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      continueOnEnter
      fieldIds={{
        demographics: firstCheckboxId('demographics'),
        sexes: firstCheckboxId('sexes'),
        genders: firstCheckboxId('genders'),
        ethnicGroups: firstCheckboxId('ethnicGroups'),
        ageType: firstRadioId('ageType'),
        ageRanges: fieldInputId(ageRangeFieldName(0, 'lowerLimit')),
      }}
      fields={pageFields(values.ageRanges.length)}
      form={form}
      title={TITLE}
    >
      <Demographics fieldErrors={fieldErrors} values={values} />
      <Radios
        defaultValue={values.ageType}
        error={fieldErrors.ageType}
        label="Select age type"
        labelHeading="h2"
        name="ageType"
        options={[
          { value: 'all', label: 'All ages' },
          {
            value: 'range',
            label: 'Age range',
            // Shown without JavaScript; with it, only while this age type is chosen.
            conditional: (
              <AgeRanges
                fieldErrors={{
                  ...fieldErrors,
                  // A refusal of the list as a whole is shown where the first range starts.
                  [ageRangeFieldName(0, 'lowerLimit')]:
                    fieldErrors[ageRangeFieldName(0, 'lowerLimit')] ?? fieldErrors.ageRanges,
                }}
                ranges={values.ageRanges}
              />
            ),
          },
          {
            value: 'specific',
            label: 'Specific age',
            conditional: (
              <>
                <TextInput
                  autoComplete="off"
                  className="govuk-input--width-5"
                  defaultValue={values.specificAge}
                  error={fieldErrors.specificAge}
                  inputMode="numeric"
                  label="Age"
                  name="specificAge"
                />
                <Select
                  defaultValue={values.specificAgeUnit}
                  error={fieldErrors.specificAgeUnit}
                  label={periodsLabel('age')}
                  name="specificAgeUnit"
                  options={UNIT_OPTIONS}
                />
              </>
            ),
          },
          {
            value: 'other',
            label: 'Other',
            conditional: (
              <TextInput
                defaultValue={values.ageDetail}
                error={fieldErrors.ageDetail}
                label={<span className="govuk-visually-hidden">Other</span>}
                name="ageDetail"
              />
            ),
          },
        ]}
      />
    </IndicatorSectionForm>
  );
}
