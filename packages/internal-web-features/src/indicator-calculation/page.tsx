import { type CalculationField, calculationSection } from '@fphd/internal-api-features/contract';
import { firstRadioId, InsetText, Radios, SummaryList, Textarea } from '@fphd/ui';
import { INDICATOR_CALCULATED_BY_LABELS } from '@fphd/utils/calculated-by';
import { NO_STANDARD_METHOD } from '@fphd/utils/standard-methods';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import type { CalculationValueTypeSummary } from './loader.ts';

interface CalculationPageProps extends SectionPageProps<CalculationField> {
  /** The draft's value type, null until one is chosen. */
  valueType: CalculationValueTypeSummary | null;
}

function standardMethodText(valueType: CalculationValueTypeSummary | null): string {
  if (valueType === null) return 'Not possible to include yet';
  return valueType.standardMethod ?? NO_STANDARD_METHOD;
}

/** What the page asks about the method, which the value type decides. */
function MethodQuestions({
  fieldErrors,
  values,
  valueType,
}: Pick<CalculationPageProps, 'fieldErrors' | 'values' | 'valueType'>) {
  if (valueType === null) {
    return (
      <InsetText>
        You need to select the value type for this indicator before you can complete this page.
      </InsetText>
    );
  }

  const methodologyField = (labelHeading?: 'h2') => (
    <Textarea
      defaultValue={values.methodology}
      error={fieldErrors.methodology}
      label="Enter methodology"
      labelHeading={labelHeading}
      name="methodology"
      rows={5}
    />
  );

  if (valueType.standardMethod === null) return methodologyField('h2');

  return (
    <Radios
      defaultValue={values.standardMethodUsed}
      error={fieldErrors.standardMethodUsed}
      label="Was the standard calculation method used for this indicator?"
      labelHeading="h2"
      name="standardMethodUsed"
      options={[
        { value: 'yes', label: 'Yes' },
        // Shown without JavaScript; with it, only while "No" is chosen.
        { value: 'no', label: 'No', conditional: methodologyField() },
      ]}
    />
  );
}

export function CalculationPage({ valueType, ...form }: CalculationPageProps) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      guidance="non-standard-calculation-method"
      form={form}
      fieldIds={{
        standardMethodUsed: firstRadioId('standardMethodUsed'),
        calculatedBy: firstRadioId('calculatedBy'),
      }}
      section={calculationSection}
      title="How the indicator was calculated"
    >
      <SummaryList
        className="govuk-!-margin-bottom-6"
        items={[
          { name: 'Value type', children: valueType?.name ?? 'Not selected yet' },
          { name: 'Standard calculation method', children: standardMethodText(valueType) },
        ]}
      />
      <MethodQuestions fieldErrors={fieldErrors} values={values} valueType={valueType} />
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
