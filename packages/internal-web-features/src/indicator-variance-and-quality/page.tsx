import {
  type VarianceAndQualityField,
  varianceAndQualitySection,
} from '@fphd/internal-api-features/contract';
import { Textarea } from '@fphd/ui';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { ReviewerUseOnly } from '../reviewer-use-only.tsx';

export function VarianceAndQualityPage(form: SectionPageProps<VarianceAndQualityField>) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      form={form}
      intro={<ReviewerUseOnly />}
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
      <Textarea
        defaultValue={values.sourceDataIssuesDetail}
        error={fieldErrors.sourceDataIssuesDetail}
        label="If there are any data quality issues, what is being done to improve the quality? (Optional)"
        labelHeading="h2"
        name="sourceDataIssuesDetail"
        rows={5}
      />
    </IndicatorSectionForm>
  );
}
