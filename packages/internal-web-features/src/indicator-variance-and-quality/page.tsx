import {
  type VarianceAndQualityField,
  varianceAndQualitySection,
} from '@fphd/internal-api-features/contract';
import { firstRadioId, Textarea } from '@fphd/ui';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { ReviewerUseOnly } from '../reviewer-use-only.tsx';
import { YesNoQuestion } from '../yes-no-question.tsx';

export function VarianceAndQualityPage(form: SectionPageProps<VarianceAndQualityField>) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      form={form}
      intro={<ReviewerUseOnly />}
      fieldIds={{ hasSourceDataIssues: firstRadioId('hasSourceDataIssues') }}
      section={varianceAndQualitySection}
      title="Variance and quality"
    >
      <Textarea
        defaultValue={values.variation}
        error={fieldErrors.variation}
        label="How does the indicator vary?"
        labelHeading="h2"
        name="variation"
        rows={5}
      />
      <Textarea
        defaultValue={values.qualityAssurance}
        error={fieldErrors.qualityAssurance}
        label="What quality assurance has been done on the indicator?"
        labelHeading="h2"
        name="qualityAssurance"
        rows={5}
      />
      <YesNoQuestion
        answer="hasSourceDataIssues"
        detail="sourceDataIssuesDetail"
        detailLabel="Enter details, including what is being done to improve the quality of the source data"
        detailRows={5}
        fieldErrors={fieldErrors}
        legend="Are there any data quality issues with the source data?"
        values={values}
      />
    </IndicatorSectionForm>
  );
}
