import { firstRadioId, Radios } from '@fphd/ui';

import { IndicatorSectionForm, QUESTION_HEADING_SIZE } from '../indicator-section-form.tsx';
import type { DecisionValues } from './loader.ts';

const DECISION_QUESTION = 'What should happen to this update?';

interface UpdateDecisionPageProps {
  submissionNumber: number;
  values: DecisionValues;
  fieldErrors: Partial<Record<keyof DecisionValues, string>>;
  formError: string | undefined;
}

/** The core team's choice for a submitted update, sent with the submission it was shown. */
export function UpdateDecisionPage({ submissionNumber, ...form }: UpdateDecisionPageProps) {
  return (
    <IndicatorSectionForm
      fieldIds={{ updateDecision: firstRadioId('updateDecision') }}
      fields={['updateDecision']}
      form={form}
      questionIsHeading
      title={DECISION_QUESTION}
    >
      <input name="submissionNumber" type="hidden" value={submissionNumber} />
      <Radios
        defaultValue={form.values.updateDecision}
        error={form.fieldErrors.updateDecision}
        label={DECISION_QUESTION}
        labelClassModifiers={QUESTION_HEADING_SIZE}
        labelHeading="h1"
        name="updateDecision"
        options={[
          { value: 'imrg_review', label: 'IMRG review' },
          { value: 'request_revisions', label: 'Request revisions' },
          { value: 'publish_with_history', label: 'Publish with visibility in history' },
          { value: 'publish_without_history', label: 'Publish without visibility in history' },
        ]}
      />
    </IndicatorSectionForm>
  );
}
