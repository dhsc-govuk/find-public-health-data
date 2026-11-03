import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useLoaderData } from 'react-router';

import type { DateValues } from './form.ts';
import { chooseReviewDate, loadReviewDate } from './loader.ts';
import { ReviewDatePage } from './pages.tsx';
import { reviewResponsePath } from './paths.ts';
import { journeySearch } from './query.ts';
import { useReviewForm } from './review-form.ts';

export const loader = loadReviewDate;

export const action = chooseReviewDate;

export const meta = titleFromPage;

export const handle = backLinkHandle<Awaited<ReturnType<typeof loader>>>(({ id, journey }) =>
  reviewResponsePath(id, 'response-type', journeySearch(journey)),
);

export function ReviewDateRoute() {
  const loaded = useLoaderData<typeof loader>();
  const form = useReviewForm<keyof DateValues, DateValues>(loaded);

  return <ReviewDatePage {...form} recap={loaded} />;
}

export default ReviewDateRoute;
