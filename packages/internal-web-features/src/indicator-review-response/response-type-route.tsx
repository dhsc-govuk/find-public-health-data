import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useLoaderData } from 'react-router';

import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import type { ResponseTypeValues } from './form.ts';
import { chooseResponseType, loadResponseType } from './loader.ts';
import { ResponseTypePage } from './pages.tsx';
import { useReviewForm } from './review-form.ts';

export const loader = loadResponseType;

export const action = chooseResponseType;

export const meta = titleFromPage;

export const handle = backLinkHandle<Awaited<ReturnType<typeof loader>>>(
  ({ id }) => indicatorOverviewPath(id),
  'Back to indicator overview',
);

export function ResponseTypeRoute() {
  const loaded = useLoaderData<typeof loader>();
  const form = useReviewForm<'responseType', ResponseTypeValues>(loaded);

  return <ResponseTypePage {...form} submissionNumber={loaded.submissionNumber} />;
}

export default ResponseTypeRoute;
