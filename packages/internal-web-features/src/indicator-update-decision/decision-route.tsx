import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useLoaderData } from 'react-router';

import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import { useReviewForm } from '../indicator-review-response/review-form.ts';
import { chooseUpdateDecision, type DecisionValues, loadUpdateDecision } from './loader.ts';
import { UpdateDecisionPage } from './pages.tsx';

export const loader = loadUpdateDecision;

export const action = chooseUpdateDecision;

export const meta = titleFromPage;

export const handle = backLinkHandle<Awaited<ReturnType<typeof loader>>>(({ id }) =>
  indicatorOverviewPath(id),
);

export function UpdateDecisionRoute() {
  const loaded = useLoaderData<typeof loader>();
  const form = useReviewForm<keyof DecisionValues, DecisionValues>(loaded);

  return <UpdateDecisionPage {...form} submissionNumber={loaded.submissionNumber} />;
}

export default UpdateDecisionRoute;
