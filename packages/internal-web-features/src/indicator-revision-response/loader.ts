// No @fphd/ui components here, so the loader and action unit-test without the jsdom they need.
import {
  type RevisionResponseError,
  revisionResponseErrorSchema,
  revisionResponseSchema,
} from '@fphd/internal-api-features/contract';
import { renderMarkdown } from '@fphd/ui/markdown';
import { ApiConflictError, apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { type LoaderFunctionArgs, redirect } from 'react-router';

import { versionedAction } from '../edit-version.ts';
import { formRefusal } from '../form-refusal.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import type { FormFailure } from '../indicator-section.ts';
import { lockedDraftRedirect, unlessDraftLocked } from '../locked-draft.ts';
import { indicatorTaskListPath } from '../publish-paths.ts';
import { REVISION_RESPONSE_FIELD, type RevisionResponseField } from './field.ts';

/** Shown when a save is refused because someone wrote the reply after the page loaded. */
export const REPLY_CHANGED =
  'Someone else has changed this response since you opened this page. Your response has not been saved. Select Continue to save it and replace their changes.';

type ReplyValues = Record<RevisionResponseField, string>;

function revisionResponseApiPath(id: string): string {
  return apiPath`/api/internal/indicators/${id}/revision-response`;
}

/** True when the API refused because no round of review has sent the draft back. */
function isNotAllowed(error: unknown): boolean {
  return (
    error instanceof ApiConflictError &&
    typeof error.body === 'object' &&
    error.body !== null &&
    'error' in error.body &&
    error.body.error === 'not_allowed'
  );
}

/**
 * The reply and the clarification request it answers, rendered from the reviewer's Markdown. A
 * locked draft sends the publisher to the overview, and one no round has sent back to its task
 * list, which then has no reply to write.
 */
export async function loadRevisionResponse({ context, params }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  const reply = await unlessDraftLocked(
    context,
    id,
    context.get(apiContext).get(revisionResponseApiPath(id), revisionResponseSchema),
  ).catch((error: unknown) => {
    if (isNotAllowed(error)) throw redirect(indicatorTaskListPath(id));
    throw error;
  });
  const values: ReplyValues = { revisionResponse: reply.revisionResponse ?? '' };

  return {
    id,
    clarificationRequest:
      reply.clarificationRequest === null ? null : renderMarkdown(reply.clarificationRequest, 's'),
    values,
    version: reply.version,
  };
}

export type RevisionResponseData = Awaited<ReturnType<typeof loadRevisionResponse>>;

function refusalOf(
  error: RevisionResponseError,
): Omit<FormFailure<RevisionResponseField, ReplyValues>, 'values'> {
  if (error.error === 'changed') {
    return { fieldErrors: {}, formError: REPLY_CHANGED, version: error.version };
  }
  return formRefusal<RevisionResponseField>(error);
}

/**
 * Saves the reply and returns to the task list. A refused reply re-renders the page with what was
 * typed; one written by someone else since brings its current version, so Continue replaces it.
 */
export const saveRevisionResponse = versionedAction(
  async ({ context, params }, { formData, version }) => {
    const id = requireIndicatorId(params);
    const typed = formData.get(REVISION_RESPONSE_FIELD);
    const values: ReplyValues = { revisionResponse: typeof typed === 'string' ? typed : '' };
    const result = await context
      .get(apiContext)
      .put(
        revisionResponseApiPath(id),
        { ...values, version },
        revisionResponseSchema,
        revisionResponseErrorSchema,
      );

    if (result.ok) return redirect(indicatorTaskListPath(id));
    if (result.error.error === 'locked') return lockedDraftRedirect(context, id);
    if (result.error.error === 'not_allowed') return redirect(indicatorTaskListPath(id));

    return { values, ...refusalOf(result.error) };
  },
);
