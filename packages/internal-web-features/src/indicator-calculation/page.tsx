import { type CalculationField, calculationSection } from '@fphd/internal-api-features/contract';
import { firstRadioId, Radios, Textarea } from '@fphd/ui';
import { INDICATOR_CALCULATED_BY_LABELS } from '@fphd/utils/calculated-by';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';

export function CalculationPage(form: SectionPageProps<CalculationField>) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      guidance="non-standard-calculation-method"
      form={form}
      fieldIds={{ calculatedBy: firstRadioId('calculatedBy') }}
      section={calculationSection}
      title="How was the indicator calculated?"
    >
      <Textarea
        defaultValue={values.methodology}
        error={fieldErrors.methodology}
        label="Enter methodology"
        labelHeading="h2"
        name="methodology"
        rows={5}
      />
      <Radios
        defaultValue={values.calculatedBy}
        error={fieldErrors.calculatedBy}
        label="Who calculated the indicator?"
        labelHeading="h2"
        name="calculatedBy"
        options={[
          { value: 'ohid', label: INDICATOR_CALCULATED_BY_LABELS.ohid },
          { value: 'dhsc', label: INDICATOR_CALCULATED_BY_LABELS.dhsc },
          {
            value: 'other',
            label: INDICATOR_CALCULATED_BY_LABELS.other,
            // Shown without JavaScript; with it, only while "Other" is chosen.
            conditional: (
              <Textarea
                defaultValue={values.calculatedByDetail}
                error={fieldErrors.calculatedByDetail}
                label="Enter details of the other organisation or organisations"
                name="calculatedByDetail"
                rows={3}
              />
            ),
          },
        ]}
      />
    </IndicatorSectionForm>
  );
}
