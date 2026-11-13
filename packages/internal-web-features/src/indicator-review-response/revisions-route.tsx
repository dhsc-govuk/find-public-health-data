import type { ReviewResponseField } from '@fphd/internal-api-features/contract';
import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useLoaderData } from 'react-router';

import type { RevisionsValues } from './form.ts';
import { loadRevisions, sendRevisions } from './loader.ts';
import { RevisionsPage } from './pages.tsx';
import { reviewResponsePath } from './paths.ts';
import { journeySearch } from './query.ts';
import { useReviewForm } from './review-form.ts';

export const loader = loadRevisions;

export const action = sendRevisions;

export const meta = titleFromPage;

// Feedback before the meeting came from the first page; revisions came from the decision.
export const handle = backLinkHandle<Awaited<ReturnType<typeof loader>>>(({ id, journey }) =>
  reviewResponsePath(
    id,
    journey.kind === 'pre_imrg_feedback' ? 'response-type' : 'approval',
    journeySearch(journey),
  ),
);

export function RevisionsRoute() {
  const loaded = useLoaderData<typeof loader>();
  const form = useReviewForm<ReviewResponseField, RevisionsValues>(loaded);

  return <RevisionsPage {...form} isUpdate={loaded.isUpdate} kind={loaded.journey.kind} />;
}

export default RevisionsRoute;
