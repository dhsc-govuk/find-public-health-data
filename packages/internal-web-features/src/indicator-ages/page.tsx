import {
  AGE_LIMIT_FIELDS,
  AGE_RANGE_PARTS,
  type AgeLimitBound,
  type AgeRangeFormValues,
  type AgesFormValues,
  type AgesPageField,
  ageLimitLabel,
  ageRangeFieldName,
  ageRangeOf,
  MAX_AGE_RANGES,
} from '@fphd/internal-api-features/contract';
import { Button, fieldInputId, firstRadioId, Radios, Select, TextInput } from '@fphd/ui';
import { AGE_UNITS } from '@fphd/utils/ages';
import type { ReactNode } from 'react';

import {
  IndicatorSectionForm,
  QUESTION_HEADING_SIZE,
  type SectionPageProps,
} from '../indicator-section-form.tsx';
import { ADD_INTENT, removeIntent } from '../list-form.ts';

type FieldErrors = Partial<Record<AgesPageField, string>>;

const TITLE = 'What ages are included in this indicator?';

const UNIT_OPTIONS = [
  { value: '', label: 'Select' },
  ...AGE_UNITS.map((unit) => ({ value: unit, label: unit })),
];

/** Every field in the order the page asks them, which the error summary follows. */
function pageFields(rangeCount: number): AgesPageField[] {
  return [
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
  const label = ageLimitLabel(bound);
  // Every range's limits read the same on screen, under its heading. A screen reader hears
  // which range a limit is in, from the second on, as the error messages name it.
  const rangeOf = ageRangeOf(index);

  return (
    <div className="fphd-field-row">
      <TextInput
        autoComplete="off"
        className="govuk-input--width-5"
        defaultValue={range[valueField]}
        error={fieldErrors[valueName]}
        inputMode="numeric"
        label={
          <>
            {label}
            {rangeOf === '' ? null : <span className="govuk-visually-hidden">{rangeOf}</span>}
          </>
        }
        name={valueName}
      />
      <Select
        defaultValue={range[unitField]}
        error={fieldErrors[unitName]}
        label={periodsLabel(`${label.toLowerCase()}${rangeOf}`)}
        name={unitName}
        options={UNIT_OPTIONS}
      />
    </div>
  );
}

/** The ranges as typed, each under its heading and removable while there is another. */
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
          <h2 className="govuk-heading-m">Age range {index + 1}</h2>
          <AgeLimit bound="lower" fieldErrors={fieldErrors} index={index} range={range} />
          <AgeLimit bound="upper" fieldErrors={fieldErrors} index={index} range={range} />
          {ranges.length > 1 ? (
            <Button classModifiers="secondary" name="intent" value={removeIntent(index)}>
              Remove range {index + 1}
            </Button>
          ) : null}
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

export function AgesPage(form: SectionPageProps<AgesPageField, AgesFormValues>) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      continueOnEnter
      fieldIds={{
        ageType: firstRadioId('ageType'),
        ageRanges: fieldInputId(ageRangeFieldName(0, 'lowerLimit')),
      }}
      fields={pageFields(values.ageRanges.length)}
      form={form}
      questionIsHeading
      title={TITLE}
    >
      <Radios
        defaultValue={values.ageType}
        error={fieldErrors.ageType}
        label={TITLE}
        labelClassModifiers={QUESTION_HEADING_SIZE}
        labelHeading="h1"
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
              <div className="fphd-field-row">
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
              </div>
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
