// No @fphd/ui imports here, so the loader unit-tests without the jsdom the components need.
import { canEditIndicator, canSeeNotesForReviewers } from '@fphd/auth/permissions';
import {
  indicatorAccess,
  indicatorAdminDetailSchema,
  notesForReviewersSchema,
} from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { takeFlash } from '@fphd/web-server/flash';
import { getSession } from '@fphd/web-server/session';
import type { LoaderFunctionArgs } from 'react-router';

import { requireIndicatorId } from '../indicator-id.ts';
import { overviewNotification } from './notifications.ts';

export type {
  IndicatorAdminDetail,
  NotesForReviewers,
} from '@fphd/internal-api-features/contract';
export type { OverviewNotification } from './notifications.ts';

// A reviewer unassigned since the detail was read gets no notes, not a missing page.
function noneIfNotFound(error: unknown): null {
  if (error instanceof Response && error.status === 404) return null;
  throw error;
}

export async function loadIndicatorOverview({ context, params }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  const api = context.get(apiContext);
  const indicator = await api.get(
    apiPath`/api/internal/indicators/${id}`,
    indicatorAdminDetailSchema,
  );

  const session = getSession(context);
  const notesForReviewers =
    session !== undefined && canSeeNotesForReviewers(session, indicatorAccess(indicator))
      ? await api
          .get(apiPath`/api/internal/indicators/${id}/notes-for-reviewers`, notesForReviewersSchema)
          .catch(noneIfNotFound)
      : null;

  // Taken after the fetches, so a failed page load does not consume the message it would show.
  const notification = overviewNotification(takeFlash(context));

  return {
    canEdit: session !== undefined && canEditIndicator(session, indicator),
    indicator,
    notesForReviewers,
    notification,
  };
}
