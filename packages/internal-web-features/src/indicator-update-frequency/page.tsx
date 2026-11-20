import {
  UPDATE_FREQUENCY_REASON_FIELDS,
  type UpdateFrequencyField,
  updateFrequencySection,
} from '@fphd/internal-api-features/contract';
import { firstRadioId, Radios, Textarea, TextInput } from '@fphd/ui';
import {
  hasUpdateFrequencyReason,
  UPDATE_FREQUENCIES,
  UPDATE_FREQUENCY_LABELS,
  type UpdateFrequency,
} from '@fphd/utils/update-frequency';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';

const UPDATE_FREQUENCY_QUESTION = 'How often will this indicator be updated?';

// The question is the page's h1, with the guidance link under it. The legend repeats the question
// for screen readers only.
export function UpdateFrequencyPage(form: SectionPageProps<UpdateFrequencyField>) {
  const { fieldErrors, values } = form;

  // The details each answer reveals: the number of years under "Frequency of more than 1 year",
  // a description under "Other", and a reason under "No fixed frequency" and "This indicator will
  // no longer be updated". They are shown without JavaScript; with it, only while their answer
  // is chosen.
  function details(value: UpdateFrequency) {
    if (value === 'every-n-years') {
      return (
        <TextInput
          autoComplete="off"
          className="govuk-input--width-3"
          defaultValue={values.updateFrequencyYears}
          error={fieldErrors.updateFrequencyYears}
          inputMode="numeric"
          label="Enter number of years"
          name="updateFrequencyYears"
          spellCheck={false}
        />
      );
    }
    if (value === 'other') {
      return (
        <Textarea
          defaultValue={values.updateFrequencyText}
          error={fieldErrors.updateFrequencyText}
          label="Enter frequency"
          name="updateFrequencyText"
          rows={3}
        />
      );
    }
    if (!hasUpdateFrequencyReason(value)) return undefined;
    const reason = UPDATE_FREQUENCY_REASON_FIELDS[value];

    return (
      <Textarea
        defaultValue={values[reason]}
        error={fieldErrors[reason]}
        label="Enter reason"
        name={reason}
        rows={3}
      />
    );
  }

  function option(value: UpdateFrequency) {
    const conditional = details(value);
    return conditional
      ? { label: UPDATE_FREQUENCY_LABELS[value], value, conditional }
      : { label: UPDATE_FREQUENCY_LABELS[value], value };
  }

  // "No longer updated" is not a frequency, so it follows the others after an "or" divider.
  const options = [
    ...UPDATE_FREQUENCIES.filter((value) => value !== 'no-longer-updated').map(option),
    'or',
    option('no-longer-updated'),
  ];

  return (
    <IndicatorSectionForm
      guidance="update-frequency"
      form={form}
      fieldIds={{ updateFrequency: firstRadioId('updateFrequency') }}
      section={updateFrequencySection}
      title={UPDATE_FREQUENCY_QUESTION}
    >
      <Radios
        defaultValue={values.updateFrequency}
        error={fieldErrors.updateFrequency}
        label={<span className="govuk-visually-hidden">{UPDATE_FREQUENCY_QUESTION}</span>}
        name="updateFrequency"
        options={options}
      />
    </IndicatorSectionForm>
  );
}
