import {
  type PublishingDateField,
  publishingDateSection,
} from '@fphd/internal-api-features/contract';
import { titleFromPage } from '@fphd/ui';
import { type ActionFunctionArgs, useLoaderData } from 'react-router';

import { saveIndicatorSection } from '../indicator-section.ts';
import { sectionBackLinkHandle, useSectionForm } from '../indicator-section-route.ts';
import { publishingDateControlNames } from '../publishing-date-form.ts';
import { loadPublishingDate } from './loader.ts';
import { PublishingDatePage } from './page.tsx';

export const loader = loadPublishingDate;

// The form checks the date and time are real; the API checks the date is at least
// PUBLISHING_NOTICE_DAYS from today and the time exists in UK time on it.
export const action = (args: ActionFunctionArgs) =>
  saveIndicatorSection(args, publishingDateSection, publishingDateControlNames);

export const meta = titleFromPage;

export const handle = sectionBackLinkHandle;

export function PublishingDateRoute() {
  const { dateExample, isUpdate } = useLoaderData<typeof loader>();

  return (
    <PublishingDatePage
      {...useSectionForm<PublishingDateField>()}
      dateExample={dateExample}
      isUpdate={isUpdate}
    />
  );
}

export default PublishingDateRoute;
