import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useLoaderData } from 'react-router';

import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import type { UpdateApprovalValues } from './form.ts';
import { chooseUpdateApproval, loadUpdateApproval } from './loader.ts';
import { UpdateApprovalPage } from './pages.tsx';
import { useReviewForm } from './review-form.ts';

export const loader = loadUpdateApproval;

export const action = chooseUpdateApproval;

export const meta = titleFromPage;

export const handle = backLinkHandle<Awaited<ReturnType<typeof loader>>>(
  ({ id }) => indicatorOverviewPath(id),
  'Back to indicator overview',
);

export function UpdateApprovalRoute() {
  const loaded = useLoaderData<typeof loader>();
  const form = useReviewForm<keyof UpdateApprovalValues, UpdateApprovalValues>(loaded);

  return <UpdateApprovalPage {...form} recap={loaded} submissionNumber={loaded.submissionNumber} />;
}

export default UpdateApprovalRoute;
