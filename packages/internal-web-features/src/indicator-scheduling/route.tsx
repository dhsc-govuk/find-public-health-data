import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useActionData, useLoaderData } from 'react-router';

import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import {
  confirmPublicationDate,
  loadPublicationDate,
  type PublicationDateRefusal,
} from './loader.ts';
import { PublicationDatePage } from './page.tsx';

export const loader = loadPublicationDate;

export const action = confirmPublicationDate;

export const meta = titleFromPage;

export const handle = backLinkHandle<Awaited<ReturnType<typeof loader>>>(
  ({ id }) => indicatorOverviewPath(id),
  'Back to indicator overview',
);

// After a refusal, the action's answer is the page as it was sent, with its errors.
export function PublicationDateRoute() {
  const { values, shownScheduledPublishAt } = useLoaderData<typeof loader>();
  const refused = useActionData<PublicationDateRefusal | undefined>();

  return (
    <PublicationDatePage
      fieldErrors={refused?.fieldErrors ?? {}}
      formError={refused?.formError}
      shownScheduledPublishAt={refused?.shownScheduledPublishAt ?? shownScheduledPublishAt}
      values={refused?.values ?? values}
    />
  );
}

export default PublicationDateRoute;
