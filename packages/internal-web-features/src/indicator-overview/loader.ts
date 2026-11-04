// No @fphd/ui imports here, so the loader unit-tests without the jsdom the components need.
import {
  canEditIndicator,
  canReviewIndicator,
  canSeeIndicatorHistory,
  canSeeNotesForReviewers,
  canWriteReviewerNotes,
} from '@fphd/auth/permissions';
import {
  indicatorAccess,
  indicatorAdminDetailSchema,
  indicatorHistorySchema,
  notesForReviewersSchema,
  reviewerNotesSchema,
} from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { takeFlash } from '@fphd/web-server/flash';
import { getSession } from '@fphd/web-server/session';
import type { LoaderFunctionArgs } from 'react-router';

import { requireIndicatorId } from '../indicator-id.ts';
import { overviewNotification } from './notifications.ts';
import { reviewerNoteFormFor } from './reviewer-notes.ts';

export type {
  IndicatorAdminDetail,
  NotesForReviewers,
  ReviewerNote,
} from '@fphd/internal-api-features/contract';
export type { OverviewNotification } from './notifications.ts';
export type { ReviewerNoteForm } from './reviewer-notes.ts';

// A reviewer unassigned since the detail was read gets no notes or history, not a missing page.
function noneIfNotFound(error: unknown): null {
  if (error instanceof Response && error.status === 404) return null;
  throw error;
}

export async function loadIndicatorOverview({ context, params, request }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  const api = context.get(apiContext);
  const indicator = await api.get(
    apiPath`/api/internal/indicators/${id}`,
    indicatorAdminDetailSchema,
  );

  const session = getSession(context);
  const access = indicatorAccess(indicator);
  const [notesForReviewers, reviewerNotes, history] = await Promise.all([
    session !== undefined && canSeeNotesForReviewers(session, access)
      ? api
          .get(apiPath`/api/internal/indicators/${id}/notes-for-reviewers`, notesForReviewersSchema)
          .catch(noneIfNotFound)
      : null,
    session !== undefined && canWriteReviewerNotes(session, access)
      ? api
          .get(apiPath`/api/internal/indicators/${id}/reviewer-notes`, reviewerNotesSchema)
          .then(({ notes }) => ({ notes, form: reviewerNoteFormFor(notes, new URL(request.url)) }))
          .catch(noneIfNotFound)
      : null,
    session !== undefined && canSeeIndicatorHistory(session, access)
      ? api
          .get(apiPath`/api/internal/indicators/${id}/history`, indicatorHistorySchema)
          .catch(noneIfNotFound)
      : null,
  ]);

  // Taken after the fetches, so a failed page load does not consume the message it would show.
  const notification = overviewNotification(takeFlash(context));

  return {
    canEdit: session !== undefined && canEditIndicator(session, indicator),
    isReviewer: session !== undefined && canReviewIndicator(session, access),
    indicator,
    notesForReviewers,
    reviewerNotes,
    history,
    notification,
  };
}
