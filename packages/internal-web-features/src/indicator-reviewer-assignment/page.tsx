import type { DraftReviewer, ReviewerOption } from '@fphd/internal-api-features/contract';
import { Button, DocumentTitle, GridColumn, GridRow, Select } from '@fphd/ui';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { ADD_INTENT, removeIntent } from '../list-form.ts';
import type { ReviewerAssignmentField, ReviewerAssignmentValues } from './form.ts';

const FIELDS: readonly ReviewerAssignmentField[] = ['addReviewer'];

const TITLE = 'Assign reviewers';

function optionLabel({ name, assignedIndicatorCount: count }: ReviewerOption): string {
  return `${name} (${count} ${count === 1 ? 'indicator' : 'indicators'} currently assigned)`;
}

interface ReviewerAssignmentPageProps
  extends SectionPageProps<ReviewerAssignmentField, ReviewerAssignmentValues> {
  options: readonly ReviewerOption[];
  /** Named even when no longer on offer, so the manager sees whom they would remove. */
  currentReviewers: readonly DraftReviewer[];
}

/**
 * A select and its Add button, then the reviewers listed so far, each carried in a hidden field
 * until Continue saves them. A listed reviewer leaves the select, so nobody is listed twice, and
 * once everyone is listed the select goes too.
 */
export function ReviewerAssignmentPage({
  currentReviewers,
  options,
  ...form
}: ReviewerAssignmentPageProps) {
  const { fieldErrors, values } = form;
  const known: readonly DraftReviewer[] = [...options, ...currentReviewers];
  const listed = values.reviewerIds.flatMap(
    (id) => known.find((reviewer) => reviewer.id === id) ?? [],
  );
  const offered = options.filter(({ id }) => !values.reviewerIds.includes(id));
  const allListed = offered.length === 0 && listed.length > 0;

  // With nobody to offer and nobody listed, there is nothing to choose, so no form either.
  if (offered.length === 0 && listed.length === 0) {
    return (
      <>
        <DocumentTitle hasErrors={false} pageTitle={TITLE} />
        <GridRow>
          <GridColumn width="two-thirds">
            <h1 className="govuk-heading-xl">{TITLE}</h1>
            <p className="govuk-body">
              There are no reviewers available to assign to this indicator.
            </p>
          </GridColumn>
        </GridRow>
      </>
    );
  }

  return (
    <IndicatorSectionForm continueOnEnter fields={FIELDS} form={form} title={TITLE}>
      <input name="submissionNumber" type="hidden" value={values.submissionNumber} />
      {values.previousReviewerIds.map((id) => (
        <input key={id} name="previousReviewerIds" type="hidden" value={id} />
      ))}
      <div className="govuk-!-margin-bottom-6">
        {/* The select and its Add button side by side, while anyone is left to add. */}
        {allListed ? null : (
          <div className="fphd-field-row fphd-field-row--with-button">
            <Select
              defaultValue={values.addReviewer}
              error={fieldErrors.addReviewer}
              label="Reviewer"
              labelClassModifiers="m"
              name="addReviewer"
              options={[
                { label: 'Select', value: '' },
                ...offered.map((option) => ({ label: optionLabel(option), value: option.id })),
              ]}
            />
            <Button classModifiers="secondary" name="intent" value={ADD_INTENT}>
              Add reviewer
            </Button>
          </div>
        )}
        {listed.length === 0 ? null : (
          <ul className="fphd-added-list">
            {listed.map(({ id, name }, index) => (
              <li className="fphd-added-list__item" key={id}>
                <input name="reviewerIds" type="hidden" value={id} />
                <span>{name}</span>
                <Button
                  classModifiers="secondary"
                  className="govuk-!-margin-bottom-0"
                  name="intent"
                  value={removeIntent(index)}
                >
                  {'Remove '}
                  <span className="govuk-visually-hidden">reviewer {name}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </IndicatorSectionForm>
  );
}
