import {
  type UpdateSummaryField,
  updateSummarySection,
} from '@fphd/internal-api-features/contract';
import { Textarea } from '@fphd/ui';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';

export function UpdateSummaryPage(form: SectionPageProps<UpdateSummaryField>) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      form={form}
      section={updateSummarySection}
      title="What is the summary of this update?"
    >
      <Textarea
        defaultValue={values.updateSummary}
        error={fieldErrors.updateSummary}
        label="Update summary for consumer-facing indicator history"
        labelHeading="h2"
        name="updateSummary"
        rows={5}
      />
      <Textarea
        defaultValue={values.updateSummaryForReviewers}
        error={fieldErrors.updateSummaryForReviewers}
        label="Additional summary information for internal reviewers (optional)"
        labelHeading="h2"
        name="updateSummaryForReviewers"
        rows={5}
      />
    </IndicatorSectionForm>
  );
}
