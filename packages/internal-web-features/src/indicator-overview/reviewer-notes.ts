// No @fphd/ui imports here, so the action unit-tests without the components' jsdom.
import { canReviewIndicators } from '@fphd/auth/permissions';
import {
  type ReviewerNote,
  type ReviewerNoteError,
  reviewerNoteErrorSchema,
  reviewerNoteFieldSchema,
  reviewerNoteSchema,
  reviewerNoteTextFormSchema,
  toFieldErrors,
} from '@fphd/internal-api-features/contract';
import { type ApiWriteResult, apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { getSession } from '@fphd/web-server/session';
import { type ActionFunctionArgs, redirect } from 'react-router';

import { setDashboardFlash } from '../dashboard/notifications.ts';
import { DASHBOARD_PATH } from '../dashboard/paths.ts';
import { readVersion } from '../edit-version.ts';
import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { EDIT_NOTE_PARAM, indicatorOverviewPath } from './paths.ts';

/** The textarea's name, which the error summary links to. */
export const REVIEWER_NOTE_FIELD = 'reviewerNote';

/** The hidden field naming the note an edit saves. */
export const NOTE_ID_FIELD = 'noteId';

/** Shown when the note was edited elsewhere after the form was filled with it. */
export const NOTE_CHANGED =
  'This note has changed since you opened it. Check it, then edit it again.';

/** The notes form: its text, and the note and version it edits, both empty when adding. */
export interface ReviewerNoteValues {
  reviewerNote: string;
  noteId: string;
  version: string;
}

/** The notes form as the page shows it: its values, and why the last save was refused. */
export interface ReviewerNoteForm {
  values: ReviewerNoteValues;
  fieldErrors: Partial<Record<typeof REVIEWER_NOTE_FIELD, string>>;
  formError?: string | undefined;
}

const ADDING: ReviewerNoteValues = { reviewerNote: '', noteId: '', version: '' };

/** The form the overview's address asks for: filled with the note it names, or empty to add. */
export function reviewerNoteFormFor(notes: readonly ReviewerNote[], url: URL): ReviewerNoteForm {
  const editing = notes.find(({ id }) => id === url.searchParams.get(EDIT_NOTE_PARAM));

  return {
    values:
      editing === undefined
        ? ADDING
        : { reviewerNote: editing.text, noteId: editing.id, version: editing.version },
    fieldErrors: {},
  };
}

function readReviewerNote(formData: FormData): ReviewerNoteValues {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };
  return {
    reviewerNote: text(REVIEWER_NOTE_FIELD),
    noteId: text(NOTE_ID_FIELD),
    version: readVersion(formData),
  };
}

function noLongerReviewer(context: ActionFunctionArgs['context']): Response {
  setDashboardFlash(context, 'no-longer-reviewer');
  return redirect(DASHBOARD_PATH);
}

function refused(values: ReviewerNoteValues, error: ReviewerNoteError): ReviewerNoteForm {
  if (error.error === 'changed') {
    return {
      values: { ...values, version: error.version },
      fieldErrors: {},
      formError: NOTE_CHANGED,
    };
  }
  if (error.error === 'validation_failed' && error.fieldErrors.text !== undefined) {
    return { values, fieldErrors: { reviewerNote: error.fieldErrors.text } };
  }
  return { values, fieldErrors: {}, formError: FORM_NOT_SAVED };
}

/**
 * Adds the reviewer's note, or saves the one the form edits, and returns to the overview. A
 * reviewer no longer assigned goes to the dashboard, which says so. A 403, for one who may
 * still see the indicator, falls to the error page as every refused write does.
 */
export async function saveReviewerNote({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<ReviewerNoteForm | Response> {
  const id = requireIndicatorId(params);
  const session = getSession(context);

  if (session === undefined || !canReviewIndicators(session)) {
    throw new Response('Not Found', { status: 404 });
  }

  const values = readReviewerNote(await request.formData());
  const checked = reviewerNoteTextFormSchema.safeParse({ text: values.reviewerNote });

  if (!checked.success) {
    const { text } = toFieldErrors(checked.error, reviewerNoteFieldSchema);
    return { values, fieldErrors: text === undefined ? {} : { reviewerNote: text } };
  }

  const api = context.get(apiContext);
  const { text } = checked.data;
  let result: ApiWriteResult<unknown, ReviewerNoteError>;

  try {
    result =
      values.noteId === ''
        ? await api.postToMember(
            apiPath`/api/internal/indicators/${id}/reviewer-notes`,
            { text },
            reviewerNoteErrorSchema,
          )
        : await api.put(
            apiPath`/api/internal/indicators/${id}/reviewer-notes/${values.noteId}`,
            { text, version: values.version },
            reviewerNoteSchema,
            reviewerNoteErrorSchema,
          );
  } catch (error) {
    if (error instanceof Response && error.status === 404) return noLongerReviewer(context);
    throw error;
  }

  if (result.ok) return redirect(indicatorOverviewPath(id));
  if (result.error.error === 'not_a_reviewer') return noLongerReviewer(context);
  return refused(values, result.error);
}
