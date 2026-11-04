// No @fphd/ui imports here, so the actions that read the form unit-test without jsdom.
import type { PublishingDateField } from '@fphd/internal-api-features/contract';

export const PUBLISHING_DATE_GROUP = 'publishingDate';
export const PUBLISHING_TIME_GROUP = 'publishingTime';

/** Each field's group on the page and its part within it. */
export const PUBLISHING_DATE_PARTS = {
  publishingDateDay: [PUBLISHING_DATE_GROUP, 'day'],
  publishingDateMonth: [PUBLISHING_DATE_GROUP, 'month'],
  publishingDateYear: [PUBLISHING_DATE_GROUP, 'year'],
  publishingTimeHour: [PUBLISHING_TIME_GROUP, 'hour'],
  publishingTimeMinute: [PUBLISHING_TIME_GROUP, 'minute'],
} as const satisfies Record<PublishingDateField, readonly [string, string]>;

/** Each field's value of `control`, given its group and part. */
export function eachPublishingDatePart(
  control: (group: string, part: string) => string,
): Record<PublishingDateField, string> {
  return Object.fromEntries(
    Object.entries(PUBLISHING_DATE_PARTS).map(([field, [group, part]]) => [
      field,
      control(group, part),
    ]),
  ) as Record<PublishingDateField, string>;
}

/** The name each field is posted under, as `datePartName` in `@fphd/ui` writes it. */
export const publishingDateControlNames = eachPublishingDatePart(
  (group, part) => `${group}[${part}]`,
);
