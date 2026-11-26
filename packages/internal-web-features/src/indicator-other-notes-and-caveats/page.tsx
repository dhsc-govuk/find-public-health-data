import {
  type OtherNotesAndCaveatsField,
  otherNotesAndCaveatsSection,
} from '@fphd/internal-api-features/contract';
import { firstRadioId, Radios } from '@fphd/ui';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { YesNoQuestion } from '../yes-no-question.tsx';

const DETAIL_ROWS = 5;

export function OtherNotesAndCaveatsPage(form: SectionPageProps<OtherNotesAndCaveatsField>) {
  const { fieldErrors, values } = form;
  const detailProps = {
    detailLabel: 'Provide details',
    detailRows: DETAIL_ROWS,
    fieldErrors,
    values,
  };

  return (
    <IndicatorSectionForm
      guidance="caveats"
      form={form}
      fieldIds={{
        hasDataQualityIssues: firstRadioId('hasDataQualityIssues'),
        hasCaveats: firstRadioId('hasCaveats'),
        hasOtherNotes: firstRadioId('hasOtherNotes'),
      }}
      section={otherNotesAndCaveatsSection}
      title="Quality, caveats and interpretation"
    >
      <Radios
        defaultValue={values.hasDataQualityIssues}
        error={fieldErrors.hasDataQualityIssues}
        hint="If yes, you should ensure these issues are clearly explained in the 'Caveats' section."
        label="Are there any data quality issues with this indicator?"
        labelHeading="h2"
        name="hasDataQualityIssues"
        options={[
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ]}
      />
      <YesNoQuestion
        {...detailProps}
        answer="hasCaveats"
        detail="caveatsDetail"
        hint={
          values.hasDataQualityIssues === 'yes'
            ? 'You need to clearly explain the data quality issues with this indicator.'
            : undefined
        }
        legend="Are there any caveats needed?"
      />
      <YesNoQuestion
        {...detailProps}
        answer="hasOtherNotes"
        detail="otherNotesDetail"
        legend="Are there any additional interpretation notes needed?"
      />
    </IndicatorSectionForm>
  );
}
