// No @fphd/ui imports here, so the loader unit-tests without the jsdom the components need.
import {
  type ReviewerComment as ApiReviewerComment,
  type FlaggableTaskKey,
  type IndicatorSubmitError,
  type IndicatorTaskList,
  type IndicatorTaskListReview,
  indicatorSubmitErrorSchema,
  indicatorTaskListSchema,
} from '@fphd/internal-api-features/contract';
import { type MarkdownHtml, renderMarkdown } from '@fphd/ui/markdown';
import { draftTaskKeys } from '@fphd/utils/indicator-task-key';
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

/** Something a reviewer wrote, rendered from their Markdown, with who wrote it. */
export interface ReviewerComment {
  reviewerName: string;
  notes: MarkdownHtml;
}

/** A flag of the round, with the reviewer's notes. */
export interface ReviewerRequest extends ReviewerComment {
  cleared: boolean;
}

/** What the round of review that sent the draft back asks of each task, as the page shows it. */
export interface ReviewerRequests {
  /** Pre-IMRG feedback advises revisions; every other round needs them. */
  advised: boolean;
  clarificationRequest: ReviewerComment | null;
  flags: Partial<Record<FlaggableTaskKey, ReviewerRequest>>;
  replied: boolean;
}

function commentOf({ reviewerName, notes }: ApiReviewerComment): ReviewerComment {
  return { reviewerName, notes: renderMarkdown(notes) };
}

/** The round's requests, with the reviewer's text rendered on the server; null with no round. */
export function reviewerRequestsOf(
  review: IndicatorTaskListReview | null,
): ReviewerRequests | null {
  if (review === null) return null;

  return {
    advised: review.kind === 'pre_imrg_feedback',
    clarificationRequest:
      review.clarificationRequest === null ? null : commentOf(review.clarificationRequest),
    flags: Object.fromEntries(
      review.flags.map(({ task, cleared, ...comment }) => [
        task,
        { ...commentOf(comment), cleared },
      ]),
    ),
    replied: (review.revisionResponse ?? '').trim() !== '',
  };
}

function hasTasksLeft({ isUpdate, tasks }: IndicatorTaskList): boolean {
  return draftTaskKeys(isUpdate).some((key) => tasks[key] !== 'completed');
}

/**
 * The whole page in one call. The API answers 404 for an indicator that is missing or has no
 * draft, which the not-found boundary renders; a draft locked for review sends the publisher to
 * the overview. Where the app offers development tools, a draft with tasks left to do offers
 * to fill them in with sample answers. A draft sent back for changes brings the round's requests,
 * rendered from the reviewer's Markdown.
 */
export async function loadIndicatorTaskList({ context, params }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  const taskList = await context
    .get(apiContext)
    .get(apiPath`/api/internal/indicators/${id}/task-list`, indicatorTaskListSchema);

  if (!taskList.editable) throw lockedDraftRedirect(context, id);

  return {
    taskList,
    requests: reviewerRequestsOf(taskList.review),
    offersSampleAnswers: context.get(devToolsContext) && hasTasksLeft(taskList),
  };
}

const NOT_SUBMITTED = 'The indicator could not be submitted. Try again.';

/** Why a submission was refused, in the words the task list shows. */
const SUBMIT_REFUSALS: Record<IndicatorSubmitError['error'], string> = {
  changed:
    'This indicator has changed since you opened this page. Check the changes, then submit again.',
  incomplete: 'Complete every task before you submit this indicator.',
  flagged: 'Save every task that needs revisions before you resubmit this indicator.',
  no_response:
    'Write your response to the revisions or clarifications before you resubmit this indicator.',
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
