// No @fphd/ui imports here, so the loader unit-tests without the jsdom the components need.
import {
  DEFAULT_PUBLISHING_TIME,
  indicatorAdminDetailSchema,
  publishingDateSection,
} from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs } from 'react-router';

import { requireIndicatorId } from '../indicator-id.ts';
import { loadIndicatorSection } from '../indicator-section.ts';

/**
 * The draft's answers, offering the default time until a date and time are saved, and whether
 * the draft updates a live indicator, which the page's wording says.
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
    isUpdate: indicatorStatus === 'live',
  };
}
