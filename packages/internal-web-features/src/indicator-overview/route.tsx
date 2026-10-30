import { backLinkHandle, createDocumentMeta } from '@fphd/ui';
import { useLoaderData } from 'react-router';
import { DASHBOARD_PATH } from '../dashboard/paths.ts';
import { loadIndicatorOverview } from './loader.ts';
import { IndicatorOverviewPage } from './page.tsx';

export const loader = loadIndicatorOverview;

export const meta = createDocumentMeta('Indicator overview');

export const handle = backLinkHandle(DASHBOARD_PATH, 'Back to indicators');

export function IndicatorOverviewRoute() {
  const { canEdit, indicator, notesForReviewers, notification } = useLoaderData<typeof loader>();
  return (
    <IndicatorOverviewPage
      canEdit={canEdit}
      indicator={indicator}
      notesForReviewers={notesForReviewers}
      notification={notification}
    />
  );
}

export default IndicatorOverviewRoute;
