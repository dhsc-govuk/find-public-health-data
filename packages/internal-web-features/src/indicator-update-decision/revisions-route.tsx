import type { ReviewResponseField } from '@fphd/internal-api-features/contract';
import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useLoaderData } from 'react-router';

import type { RevisionsValues } from '../indicator-review-response/form.ts';
import { RevisionsPage } from '../indicator-review-response/pages.tsx';
import { useReviewForm } from '../indicator-review-response/review-form.ts';
import { loadUpdateRevisions, sendUpdateRevisions } from './loader.ts';
import { updateDecisionPath } from './paths.ts';

export const loader = loadUpdateRevisions;

export const action = sendUpdateRevisions;

export const meta = titleFromPage;

export const handle = backLinkHandle<Awaited<ReturnType<typeof loader>>>(({ id }) =>
  updateDecisionPath(id, 'request_revisions'),
);

// The core team asks for revisions before any IMRG review, so the notes are worded as advice.
export function UpdateRevisionsRoute() {
  const loaded = useLoaderData<typeof loader>();
  const form = useReviewForm<ReviewResponseField, RevisionsValues>(loaded);

  return <RevisionsPage {...form} isUpdate kind="pre_imrg_feedback" />;
}

export default UpdateRevisionsRoute;
