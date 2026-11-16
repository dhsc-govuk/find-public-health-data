import { indicatorStartUpdateErrorSchema } from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { type ActionFunctionArgs, redirect } from 'react-router';

import { requireIndicatorId } from '../indicator-id.ts';
import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import { indicatorTaskListPath } from '../publish-paths.ts';

/**
 * Opens a draft of the live indicator from its published version, from the overview's "Update
 * indicator" button, and goes to the task list. A draft already open, perhaps from a double click,
 * is the update the publisher asked for, so the task list shows it too. Any other refusal returns
 * to the overview, which shows what the indicator offers now.
 */
export async function startIndicatorUpdate({
  context,
  params,
}: ActionFunctionArgs): Promise<Response> {
  const id = requireIndicatorId(params);
  const result = await context
    .get(apiContext)
    .postToMember(
      apiPath`/api/internal/indicators/${id}/draft`,
      {},
      indicatorStartUpdateErrorSchema,
    );

  return result.ok || result.error.error === 'draft_exists'
    ? redirect(indicatorTaskListPath(id))
    : redirect(indicatorOverviewPath(id));
}
