import {
  type OtherCommentsField,
  otherCommentsSection,
} from '@fphd/internal-api-features/contract';
import { firstRadioId, Textarea } from '@fphd/ui';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { ReviewerUseOnly } from '../reviewer-use-only.tsx';
import { YesNoQuestion } from '../yes-no-question.tsx';

export function OtherCommentsPage(form: SectionPageProps<OtherCommentsField>) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      form={form}
      intro={<ReviewerUseOnly />}
      fieldIds={{ hasReviewerComments: firstRadioId('hasReviewerComments') }}
      section={otherCommentsSection}
      title="Other comments"
    >
      <Textarea
        defaultValue={values.sponsorsAndStakeholders}
        error={fieldErrors.sponsorsAndStakeholders}
        label="Enter any applicable sponsors or stakeholders for this indicator (optional)"
        labelHeading="h2"
        name="sponsorsAndStakeholders"
        rows={5}
      />
      <YesNoQuestion
        answer="hasReviewerComments"
        detail="reviewerCommentsDetail"
        detailLabel="Enter comments"
        detailRows={5}
        fieldErrors={fieldErrors}
        legend="Are there any other comments for the reviewers?"
        values={values}
      />
    </IndicatorSectionForm>
  );
}
