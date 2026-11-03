import { ErrorMessage, Label, Markdown, type MarkdownHtml } from '@fphd/ui';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { REVISION_RESPONSE_FIELD, type RevisionResponseField } from './field.ts';

export const REVISION_RESPONSE_TITLE = 'Response to revisions or clarifications';

// The ids the house components give a field, so the error summary links to it.
const INPUT_ID = `${REVISION_RESPONSE_FIELD}-input`;
const HINT_ID = `${REVISION_RESPONSE_FIELD}-hint`;
const ERROR_ID = `${REVISION_RESPONSE_FIELD}-error`;

interface RevisionResponsePageProps extends SectionPageProps<RevisionResponseField> {
  /** The reviewer's clarification request, rendered from their Markdown; null with none. */
  clarificationRequest: MarkdownHtml | null;
}

/** The publisher's reply to what the round of review asked for, as the prototype asks it. */
export function RevisionResponsePage({ clarificationRequest, ...form }: RevisionResponsePageProps) {
  const error = form.fieldErrors.revisionResponse;

  return (
    <IndicatorSectionForm
      fields={[REVISION_RESPONSE_FIELD]}
      form={form}
      questionIsHeading
      title={REVISION_RESPONSE_TITLE}
    >
      <div className={`govuk-form-group${error === undefined ? '' : ' govuk-form-group--error'}`}>
        <h1 className="govuk-label-wrapper">
          <Label classModifiers="xl" htmlFor={INPUT_ID}>
            {REVISION_RESPONSE_TITLE}
          </Label>
        </h1>
        {clarificationRequest === null ? null : (
          <>
            <h2 className="govuk-heading-s">High-level clarification request</h2>
            <Markdown className="govuk-!-margin-bottom-6" html={clarificationRequest} />
          </>
        )}
        <div className="govuk-body" id={HINT_ID}>
          Summarise:
          <ul className="govuk-list govuk-list--bullet">
            <li>any changes you have made in response to advised revisions</li>
            <li>if you have not made any advised revisions and why</li>
            <li>any response you have to any clarifications requested</li>
          </ul>
        </div>
        {error === undefined ? null : <ErrorMessage id={ERROR_ID}>{error}</ErrorMessage>}
        <textarea
          aria-describedby={error === undefined ? HINT_ID : `${HINT_ID} ${ERROR_ID}`}
          className={`govuk-textarea${error === undefined ? '' : ' govuk-textarea--error'}`}
          defaultValue={form.values.revisionResponse}
          id={INPUT_ID}
          name={REVISION_RESPONSE_FIELD}
          rows={8}
        />
      </div>
    </IndicatorSectionForm>
  );
}
