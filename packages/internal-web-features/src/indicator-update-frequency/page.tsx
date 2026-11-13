import {
  UPDATE_FREQUENCY_REASON_FIELDS,
  type UpdateFrequencyField,
  updateFrequencySection,
} from '@fphd/internal-api-features/contract';
import { firstRadioId, Radios, Textarea } from '@fphd/ui';
import {
  hasUpdateFrequencyReason,
  UPDATE_FREQUENCIES,
  UPDATE_FREQUENCY_LABELS,
  type UpdateFrequency,
} from '@fphd/utils/update-frequency';

import {
  IndicatorSectionForm,
  QUESTION_HEADING_SIZE,
  type SectionPageProps,
} from '../indicator-section-form.tsx';

const UPDATE_FREQUENCY_QUESTION = 'How often will this indicator be updated?';

// The question is the page's h1, inside the legend.
export function UpdateFrequencyPage(form: SectionPageProps<UpdateFrequencyField>) {
  const { fieldErrors, values } = form;

  // "No fixed frequency" and "This indicator will no longer be updated" each reveal a box for
  // the reason. It is shown without JavaScript; with it, only while its answer is chosen.
  function option(value: UpdateFrequency) {
    if (!hasUpdateFrequencyReason(value)) return { label: UPDATE_FREQUENCY_LABELS[value], value };
    const reason = UPDATE_FREQUENCY_REASON_FIELDS[value];

    return {
      label: UPDATE_FREQUENCY_LABELS[value],
      value,
      conditional: (
        <Textarea
          defaultValue={values[reason]}
          error={fieldErrors[reason]}
          label="Enter reason"
          name={reason}
          rows={3}
        />
      ),
    };
  }

  // "No longer updated" is not a frequency, so it follows the others after an "or" divider.
  const options = [
    ...UPDATE_FREQUENCIES.filter((value) => value !== 'no-longer-updated').map(option),
    'or',
    option('no-longer-updated'),
  ];

  return (
    <IndicatorSectionForm
      form={form}
      fieldIds={{ updateFrequency: firstRadioId('updateFrequency') }}
      section={updateFrequencySection}
      questionIsHeading
      title={UPDATE_FREQUENCY_QUESTION}
    >
      <Radios
        defaultValue={values.updateFrequency}
        error={fieldErrors.updateFrequency}
        label={UPDATE_FREQUENCY_QUESTION}
        labelClassModifiers={QUESTION_HEADING_SIZE}
        labelHeading="h1"
        name="updateFrequency"
        options={options}
      />
    </IndicatorSectionForm>
  );
}
