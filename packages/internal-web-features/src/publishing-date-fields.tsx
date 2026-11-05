import type { PublishingDateField } from '@fphd/internal-api-features/contract';
import { DateInput, datePartId, TimeInput } from '@fphd/ui';

import {
  eachPublishingDatePart,
  PUBLISHING_DATE_GROUP,
  PUBLISHING_DATE_PARTS,
  PUBLISHING_TIME_GROUP,
} from './publishing-date-form.ts';

/** Where the error summary links each field: its own part of the date or time. */
export const publishingDateFieldIds = eachPublishingDatePart(datePartId);

/** The messages on one group's parts, by part; none when no part has one. */
function groupError(
  fieldErrors: Partial<Record<PublishingDateField, string>>,
  group: string,
): Record<string, string> | undefined {
  const errors = Object.entries(PUBLISHING_DATE_PARTS).flatMap(([field, [inGroup, part]]) => {
    const message = fieldErrors[field as PublishingDateField];
    return inGroup === group && message !== undefined ? [[part, message]] : [];
  });

  return errors.length === 0 ? undefined : Object.fromEntries(errors);
}

interface PublishingDateFieldsProps {
  values: Record<PublishingDateField, string>;
  fieldErrors: Partial<Record<PublishingDateField, string>>;
  dateHint: string;
}

/**
 * The publishing date and time, as the publisher's page and the admin's confirmation ask them.
 * Each group shows its first message and marks only the parts given one.
 */
export function PublishingDateFields({ values, fieldErrors, dateHint }: PublishingDateFieldsProps) {
  return (
    <>
      <DateInput
        defaultValue={{
          day: values.publishingDateDay,
          month: values.publishingDateMonth,
          year: values.publishingDateYear,
        }}
        error={groupError(fieldErrors, PUBLISHING_DATE_GROUP)}
        hint={dateHint}
        label="Date"
        labelHeading="h2"
        name={PUBLISHING_DATE_GROUP}
      />
      <TimeInput
        defaultValue={{ hour: values.publishingTimeHour, minute: values.publishingTimeMinute }}
        error={groupError(fieldErrors, PUBLISHING_TIME_GROUP)}
        hint="This will be 09:30 local UK time by default. Only change this if a different publication time is needed. Use 24 hour clock format, for example 15:00."
        label="Time"
        labelHeading="h2"
        name={PUBLISHING_TIME_GROUP}
      />
    </>
  );
}
