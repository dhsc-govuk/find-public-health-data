import {
  type JustificationsField,
  justificationsSection,
} from '@fphd/internal-api-features/contract';
import { firstRadioId, Textarea } from '@fphd/ui';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { ReviewerUseOnly } from '../reviewer-use-only.tsx';
import { YesNoQuestion } from '../yes-no-question.tsx';

const TEXT_QUESTIONS = [
  { name: 'ciMethodJustification', label: 'Why was the confidence interval method chosen?' },
  { name: 'dataSourcesJustification', label: 'Why were the data sources chosen?' },
  { name: 'inequalitiesIncluded', label: 'What health inequalities have been included?' },
] as const;

export function JustificationsPage(form: SectionPageProps<JustificationsField>) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      form={form}
      intro={<ReviewerUseOnly />}
      fieldIds={{
        hasExclusions: firstRadioId('hasExclusions'),
        hasAutomation: firstRadioId('hasAutomation'),
      }}
      section={justificationsSection}
      title="Justifications"
    >
      {TEXT_QUESTIONS.map(({ name, label }) => (
        <Textarea
          key={name}
          defaultValue={values[name]}
          error={fieldErrors[name]}
          label={label}
          labelHeading="h2"
          name={name}
          rows={5}
        />
      ))}
      <YesNoQuestion
        answer="hasExclusions"
        detail="exclusionsDetail"
        detailLabel="Enter why exclusions were made"
        detailRows={5}
        fieldErrors={fieldErrors}
        legend="Have there been any exclusions?"
        values={values}
      />
      <YesNoQuestion
        answer="hasAutomation"
        detail="automationDetail"
        detailLabel="Enter details of the tools used"
        detailRows={5}
        fieldErrors={fieldErrors}
        legend="Have internal automation tools been used to create this indicator?"
        noDetail={{ name: 'noAutomationReason', label: 'Enter reasons why not' }}
        values={values}
      />
    </IndicatorSectionForm>
  );
}
