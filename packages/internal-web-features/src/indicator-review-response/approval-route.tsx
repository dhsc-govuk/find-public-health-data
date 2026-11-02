import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useLoaderData } from 'react-router';

import type { ApprovalValues } from './form.ts';
import { chooseApproval, loadApproval } from './loader.ts';
import { ApprovalPage } from './pages.tsx';
import { reviewResponsePath } from './paths.ts';
import { journeySearch } from './query.ts';
import { useReviewForm } from './review-form.ts';

export const loader = loadApproval;

export const action = chooseApproval;

export const meta = titleFromPage;

export const handle = backLinkHandle<Awaited<ReturnType<typeof loader>>>(({ id, journey }) =>
  reviewResponsePath(id, 'date', journeySearch({ ...journey, kind: undefined })),
);

export function ApprovalRoute() {
  const loaded = useLoaderData<typeof loader>();
  const form = useReviewForm<keyof ApprovalValues, ApprovalValues>(loaded);

  return <ApprovalPage {...form} recap={loaded} />;
}

export default ApprovalRoute;
