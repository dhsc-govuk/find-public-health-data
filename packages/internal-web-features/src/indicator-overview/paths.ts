import { DASHBOARD_PATH } from '../dashboard/paths.ts';

export function indicatorOverviewPath(id: string): string {
  return `${DASHBOARD_PATH}/indicators/${encodeURIComponent(id)}`;
}

/** Where an IMRG manager assigns the reviewers of the draft's submission, or changes them. */
export function indicatorAssignReviewersPath(id: string): string {
  return `${indicatorOverviewPath(id)}/assign-reviewers`;
}

/** The query parameter naming the reviewer's note the overview's form edits. */
export const EDIT_NOTE_PARAM = 'note';

/** The overview with the reviewer's note `noteId` in the notes form, scrolled to it. */
// The fragment is fieldInputId('reviewerNote') spelt out: the loader's modules keep clear of @fphd/ui.
export function reviewerNoteEditPath(id: string, noteId: string): string {
  return `${indicatorOverviewPath(id)}?${new URLSearchParams({ [EDIT_NOTE_PARAM]: noteId })}#reviewerNote-input`;
}
