import {
  type PublishingDateField,
  publishingDateSection,
} from '@fphd/internal-api-features/contract';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { PublishingDateFields, publishingDateFieldIds } from '../publishing-date-fields.tsx';

interface PublishingDatePageProps extends SectionPageProps<PublishingDateField> {
  /** A date the form would accept, as day, month and year numbers separated by spaces. */
  dateExample: string;
}

export function PublishingDatePage({ dateExample, ...form }: PublishingDatePageProps) {
  return (
    <IndicatorSectionForm
      fieldIds={publishingDateFieldIds}
      form={form}
      section={publishingDateSection}
      title="When should this indicator be published?"
    >
      <PublishingDateFields
        dateHint={`For example, ${dateExample}`}
        fieldErrors={form.fieldErrors}
        values={form.values}
      />
    </IndicatorSectionForm>
  );
}
