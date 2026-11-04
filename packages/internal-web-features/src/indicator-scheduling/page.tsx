import {
  type PublishingDateField,
  publishingDateSection,
} from '@fphd/internal-api-features/contract';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { PublishingDateFields, publishingDateFieldIds } from '../publishing-date-fields.tsx';
import { SHOWN_FIELD } from './loader.ts';

interface PublicationDatePageProps extends Omit<SectionPageProps<PublishingDateField>, 'version'> {
  /** The date the page first showed, which the save sends back. */
  shownScheduledPublishAt: string;
}

/** The approved indicator's date and time, for an admin to confirm as they are or change. */
export function PublicationDatePage({
  shownScheduledPublishAt,
  ...form
}: PublicationDatePageProps) {
  return (
    <IndicatorSectionForm
      fieldIds={publishingDateFieldIds}
      form={form}
      section={publishingDateSection}
      submitLabel="Submit"
      title="Confirm publication date"
    >
      <input name={SHOWN_FIELD} type="hidden" value={shownScheduledPublishAt} />
      <PublishingDateFields
        dateHint="Use numbers only in the format DD MM YYYY."
        fieldErrors={form.fieldErrors}
        values={form.values}
      />
    </IndicatorSectionForm>
  );
}
