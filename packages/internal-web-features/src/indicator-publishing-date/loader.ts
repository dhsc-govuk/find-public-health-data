// No @fphd/ui imports here, so the loader unit-tests without the jsdom the components need.
import {
  DEFAULT_PUBLISHING_TIME,
  indicatorAdminDetailSchema,
  PUBLISHING_NOTICE_DAYS,
  publishingDateSection,
} from '@fphd/internal-api-features/contract';
import { ukDateAfter } from '@fphd/utils/uk-time';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs } from 'react-router';

import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSection } from '../indicator-section.ts';

/** A date well past the notice period, as the hint's example gives it: "14 9 2026". */
export function publishingDateExample(now: Date): string {
  const { day, month, year } = ukDateAfter(now, PUBLISHING_NOTICE_DAYS * 2);
  return `${day} ${month} ${year}`;
}

/**
 * The draft's answers, offering the default time until a date and time are saved, an example
 * date from today's, and whether the draft updates a live indicator, which the heading says.
 */
export async function loadPublishingDate(args: LoaderFunctionArgs) {
  const [{ id, values, version }, { indicatorStatus }] = await Promise.all([
    loadIndicatorSection(args, publishingDateSection),
    args.context
      .get(apiContext)
      .get(
        apiPath`/api/internal/indicators/${requireIndicatorId(args.params)}`,
        indicatorAdminDetailSchema,
      ),
  ]);
  const unanswered = values.publishingTimeHour === '' && values.publishingTimeMinute === '';

  return {
    id,
    values: unanswered ? { ...values, ...DEFAULT_PUBLISHING_TIME } : values,
    version,
    dateExample: publishingDateExample(new Date()),
    isUpdate: indicatorStatus === 'live',
  };
}
