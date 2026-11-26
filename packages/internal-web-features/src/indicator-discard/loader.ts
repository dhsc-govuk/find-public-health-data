// No @fphd/ui imports here, so the loader and action unit-test without the components' jsdom.
import {
  type IndicatorDiscardError,
  indicatorAdminDetailSchema,
  indicatorDiscardErrorSchema,
} from '@fphd/internal-api-features/contract';
import { type ApiClient, ApiTimeoutError, apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';

import { type DashboardFlash, setDashboardFlash } from '../dashboard/notifications.ts';
import { DASHBOARD_PATH } from '../dashboard/paths.ts';
import { requireEditableIndicator } from '../editable-indicator.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { type OverviewFlash, setOverviewFlash } from '../indicator-overview/notifications.ts';
import { indicatorOverviewPath } from '../indicator-overview/paths.ts';

function readIndicator(api: ApiClient, id: string) {
  return api.get(apiPath`/api/internal/indicators/${id}`, indicatorAdminDetailSchema);
}

/**
 * The draft to discard. When there is none, or a review has started on it, the publisher is sent
 * to the overview, which says so.
 */
export async function loadIndicatorDiscard({ context, params }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  const indicator = await readIndicator(context.get(apiContext), id);

  requireEditableIndicator(context, indicator);

  const { canDiscardDraft, draftUpdatedAt, indicatorStatus } = indicator;

  if (!canDiscardDraft || draftUpdatedAt === null) {
    setOverviewFlash(context, 'discard-refused');
    throw redirect(indicatorOverviewPath(id));
  }

  return { id, draftUpdatedAt, indicatorStatus };
}

const REFUSAL_FLASHES: Record<IndicatorDiscardError['error'], OverviewFlash> = {
  already_discarded: 'already-discarded',
  changed: 'discard-changed',
  upload_running: 'discard-upload-running',
  not_allowed: 'discard-refused',
  invalid_id: 'discard-refused',
  invalid_draft_updated_at: 'discard-refused',
};

function isNotFound(error: unknown): boolean {
  return error instanceof Response && error.status === 404;
}

/** Whether the indicator still exists. A new one is deleted with its draft. */
async function stillExists(api: ApiClient, id: string): Promise<boolean> {
  try {
    await readIndicator(api, id);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/**
 * The confirmation page is the guard: this runs only from its POST. It discards the draft the page
 * showed and returns to the overview, or to the dashboard when the indicator is gone, as it is once
 * a new indicator's draft is discarded. Either says whether the draft was discarded.
 *
 * Deleting a large data table can be slow, so this waits as long as an upload does. The API
 * carries on after that, so the dashboard says the discard has not finished.
 */
export async function discardDraft({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<Response> {
  const id = requireIndicatorId(params);
  const draftUpdatedAt = (await request.formData()).get('draftUpdatedAt');
  const api = context.get(apiContext);
  const toDashboard = (flash: DashboardFlash) => {
    setDashboardFlash(context, flash);
    return redirect(DASHBOARD_PATH);
  };

  try {
    const result = await api.postToMember(
      apiPath`/api/internal/indicators/${id}/discard`,
      { draftUpdatedAt: typeof draftUpdatedAt === 'string' ? draftUpdatedAt : '' },
      indicatorDiscardErrorSchema,
      { timeout: 'upload' },
    );

    // A refusal finds it gone too, when it waited for another discard to finish.
    if (!(await stillExists(api, id))) {
      return toDashboard(result.ok ? 'draft-discarded' : 'already-discarded');
    }

    setOverviewFlash(context, result.ok ? 'draft-discarded' : REFUSAL_FLASHES[result.error.error]);
    return redirect(indicatorOverviewPath(id));
  } catch (error) {
    if (error instanceof ApiTimeoutError) return toDashboard('discard-unfinished');
    // The API also answers 404 for an indicator the user may see but not edit.
    if (isNotFound(error) && !(await stillExists(api, id))) return toDashboard('already-discarded');
    throw error;
  }
}
