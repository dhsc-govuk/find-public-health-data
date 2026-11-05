import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useActionData, useLoaderData } from 'react-router';
import { DASHBOARD_PATH } from '../dashboard/paths.ts';
import { loadIndicatorOverview } from './loader.ts';
import { IndicatorOverviewPage } from './page.tsx';
import { type ReviewerNoteForm, saveReviewerNote } from './reviewer-notes.ts';

export const loader = loadIndicatorOverview;

export const action = saveReviewerNote;

export const meta = titleFromPage;

export const handle = backLinkHandle(DASHBOARD_PATH, 'Back to indicators');

export function IndicatorOverviewRoute() {
  const {
    canEdit,
    isReviewer,
    indicator,
    notesForReviewers,
    reviewerNotes,
    history,
    notification,
  } = useLoaderData<typeof loader>();
  // A refused save shows the form as it was sent, in place of the one the address asks for.
  const refused = useActionData<ReviewerNoteForm | undefined>();
  return (
    <IndicatorOverviewPage
      canEdit={canEdit}
      isReviewer={isReviewer}
      indicator={indicator}
      notesForReviewers={notesForReviewers}
      reviewerNotes={
        reviewerNotes === null ? null : { ...reviewerNotes, form: refused ?? reviewerNotes.form }
      }
      history={history}
      notification={notification}
    />
  );
}

export default IndicatorOverviewRoute;
