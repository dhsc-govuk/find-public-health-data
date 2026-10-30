// No @fphd/ui imports here, so the loader unit-tests without the jsdom the components need.
import {
  type IndicatorSubmitError,
  indicatorSubmitErrorSchema,
  indicatorTaskListSchema,
} from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';

import { devToolsContext } from '../dev-tools.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { setOverviewFlash } from '../indicator-overview/notifications.ts';
import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import { lockedDraftRedirect } from '../locked-draft.ts';

export type {
  IndicatorTaskKey,
  IndicatorTaskList,
  IndicatorTaskStatus,
} from '@fphd/internal-api-features/contract';

/**
 * The whole page in one call. The API answers 404 for an indicator that is missing or has no
 * draft, which the not-found boundary renders; a draft locked for review sends the publisher to
 * the overview. Where the app offers development tools, a draft with tasks left to do offers
 * to fill them in with sample answers.
 */
export async function loadIndicatorTaskList({ context, params }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  const taskList = await context
    .get(apiContext)
    .get(apiPath`/api/internal/indicators/${id}/task-list`, indicatorTaskListSchema);

  if (!taskList.editable) throw lockedDraftRedirect(context, id);

  return { taskList, offersSampleAnswers: context.get(devToolsContext) && !taskList.canSubmit };
}

const NOT_SUBMITTED = 'The indicator could not be submitted. Try again.';

/** Why a submission was refused, in the words the task list shows. */
const SUBMIT_REFUSALS: Record<IndicatorSubmitError['error'], string> = {
  changed:
    'This indicator has changed since you opened this page. Check the changes, then submit again.',
  incomplete: 'Complete every task before you submit this indicator.',
  not_allowed: 'This indicator cannot be submitted for approval.',
  invalid_id: NOT_SUBMITTED,
  invalid_draft_updated_at: NOT_SUBMITTED,
};

/** A refused submission, which the task list shows in its error summary. */
export interface SubmitRefusal {
  formError: string;
}

/**
 * Submits the draft as the task list showed it and goes to the overview, which says so. A
 * refusal stays on the task list, which reloads with the draft as it now stands.
 */
export async function submitIndicator({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<SubmitRefusal | Response> {
  const id = requireIndicatorId(params);
  const draftUpdatedAt = (await request.formData()).get('draftUpdatedAt');
  const result = await context
    .get(apiContext)
    .postToMember(
      apiPath`/api/internal/indicators/${id}/submit`,
      { draftUpdatedAt: typeof draftUpdatedAt === 'string' ? draftUpdatedAt : '' },
      indicatorSubmitErrorSchema,
    );

  if (!result.ok) return { formError: SUBMIT_REFUSALS[result.error.error] };

  setOverviewFlash(context, 'indicator-submitted');

  return redirect(indicatorOverviewPath(id));
}
