import {
  type OtherNotesAndCaveatsField,
  otherNotesAndCaveatsSection,
} from '@fphd/internal-api-features/contract';
import { firstRadioId } from '@fphd/ui';
import { INDICATOR_DISCLOSURE_CONTROL_LABELS } from '@fphd/utils/disclosure-control';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { YesNoQuestion } from '../yes-no-question.tsx';

const QUESTIONS = [
  {
    answer: 'disclosureControl',
    detail: 'disclosureControlDetail',
    legend: 'Has disclosure control been applied?',
    moreOptions: [
      {
        value: 'not-applicable',
        label: INDICATOR_DISCLOSURE_CONTROL_LABELS['not-applicable'],
      },
    ],
  },
  { answer: 'hasRounding', detail: 'roundingDetail', legend: 'Has any rounding been applied?' },
  { answer: 'hasCaveats', detail: 'caveatsDetail', legend: 'Are there any caveats needed?' },
  {
    answer: 'hasOtherNotes',
    detail: 'otherNotesDetail',
    legend: 'Are there any other notes needed?',
  },
] as const;

export function OtherNotesAndCaveatsPage(form: SectionPageProps<OtherNotesAndCaveatsField>) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      guidance="caveats"
      form={form}
      fieldIds={Object.fromEntries(QUESTIONS.map(({ answer }) => [answer, firstRadioId(answer)]))}
      section={otherNotesAndCaveatsSection}
      title="Provide any other notes and caveats"
    >
      {QUESTIONS.map((question) => (
        <YesNoQuestion
          key={question.answer}
          {...question}
          detailLabel="Provide details"
          detailRows={2}
          fieldErrors={fieldErrors}
          values={values}
        />
      ))}
    </IndicatorSectionForm>
  );
}
