import { z } from '@fphd/config/zod';
import { ukInstant } from '@fphd/utils/uk-time';

import {
  type PublishingDateField,
  publishingDateSection,
  REAL_PUBLISHING_TIME,
} from './indicator-publishing-date-contract.ts';

export const FUTURE_PUBLISHING_DATE = 'Publishing date and time must be in the future';

const DATE_PARTS: readonly PublishingDateField[] = [
  'publishingDateDay',
  'publishingDateMonth',
  'publishingDateYear',
];
const TIME_PARTS: readonly PublishingDateField[] = ['publishingTimeHour', 'publishingTimeMinute'];

/**
 * An admin's confirmation of a publication date: the date and time as the publisher's page asks
 * them, and the date the page showed, so a date changed since is never overwritten unseen.
 */
export const indicatorScheduleBodySchema = z.object({
  publishingDateDay: z.string(),
  publishingDateMonth: z.string(),
  publishingDateYear: z.string(),
  publishingTimeHour: z.string(),
  publishingTimeMinute: z.string(),
  shownScheduledPublishAt: z.iso.datetime(),
});

/**
 * The date and time the publisher's page accepts, with no notice period since the indicator is
 * approved, naming an instant that exists in UK time and comes after `now`.
 */
export function scheduleSchemaFor(now: Date) {
  return publishingDateSection.schema.transform((answers, ctx) => {
    const every = (parts: readonly PublishingDateField[], message: string) => {
      for (const part of parts) ctx.addIssue({ code: 'custom', path: [part], message });
      return z.NEVER;
    };
    const scheduledPublishAt = ukInstant({
      year: Number(answers.publishingDateYear),
      month: Number(answers.publishingDateMonth),
      day: Number(answers.publishingDateDay),
      hour: Number(answers.publishingTimeHour),
      minute: Number(answers.publishingTimeMinute),
    });

    if (scheduledPublishAt === null) return every(TIME_PARTS, REAL_PUBLISHING_TIME);
    if (scheduledPublishAt <= now) return every(DATE_PARTS, FUTURE_PUBLISHING_DATE);
    return { scheduledPublishAt };
  });
}

export const indicatorScheduleFieldErrorsSchema = z.partialRecord(
  publishingDateSection.fields,
  z.string(),
);

/**
 * The 400 and 409 answers. `validation_failed` names the fields at fault. `not_allowed` means the
 * indicator is not approved and waiting to be published; `changed` that its date is not the one
 * the admin was shown. A missing indicator or unpublished version is a 404, which the client throws.
 */
export const indicatorScheduleErrorSchema = z.discriminatedUnion('error', [
  z.object({ error: z.enum(['invalid_id', 'invalid_request', 'not_allowed', 'changed']) }),
  z.object({
    error: z.literal('validation_failed'),
    fieldErrors: indicatorScheduleFieldErrorsSchema,
  }),
]);

export type IndicatorScheduleBody = z.infer<typeof indicatorScheduleBodySchema>;
export type IndicatorScheduleFieldErrors = z.infer<typeof indicatorScheduleFieldErrorsSchema>;
export type IndicatorScheduleError = z.infer<typeof indicatorScheduleErrorSchema>;
