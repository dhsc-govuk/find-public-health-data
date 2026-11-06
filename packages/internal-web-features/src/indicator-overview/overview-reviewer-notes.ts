// No @fphd/ui imports here, so the loader unit-tests without the jsdom the components need.
import type { DraftReviewer, ListedReviewerNote } from '@fphd/internal-api-features/contract';

import { type ReviewerNoteForm, reviewerNoteFormFor } from './reviewer-note-form.ts';

/** One reviewer's notes, newest first, as a read-only section shows them. */
export interface AuthorNotes {
  author: DraftReviewer;
  notes: ListedReviewerNote[];
}

/** The reviewers' notes as the overview shows them. */
export interface OverviewReviewerNotes {
  /** The assigned reviewer's own notes and the form for them; null for anyone else. */
  reviewerNotes: { notes: ListedReviewerNote[]; form: ReviewerNoteForm } | null;
  /** Everyone else's notes, read only, one entry per reviewer. */
  otherReviewerNotes: AuthorNotes[];
}

/**
 * The notes of every reviewer but `writerId`, one entry per reviewer: the assigned reviewers in
 * their order, each whether or not they have written any, then reviewers unassigned since they
 * wrote theirs, by name.
 */
export function notesByAuthor(
  notes: readonly ListedReviewerNote[],
  reviewers: readonly DraftReviewer[],
  writerId: string | undefined,
): AuthorNotes[] {
  const unassigned = notes
    .map(({ author }) => author)
    .filter(
      (author, index, authors) =>
        !reviewers.some(({ id }) => id === author.id) &&
        authors.findIndex(({ id }) => id === author.id) === index,
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...reviewers, ...unassigned]
    .filter(({ id }) => id !== writerId)
    .map((author) => ({ author, notes: notes.filter((note) => note.author.id === author.id) }));
}

/**
 * The notes the reader may see, split for the overview: the writer's own, with the form the
 * address asks for, and everyone else's. `writerId` is the reader when they may write notes.
 */
export function overviewReviewerNotes(
  notes: readonly ListedReviewerNote[] | null,
  reviewers: readonly DraftReviewer[],
  writerId: string | undefined,
  url: URL,
): OverviewReviewerNotes {
  if (notes === null) return { reviewerNotes: null, otherReviewerNotes: [] };

  const own = notes.filter(({ author }) => author.id === writerId);

  return {
    reviewerNotes:
      writerId === undefined ? null : { notes: own, form: reviewerNoteFormFor(own, url) },
    otherReviewerNotes: notesByAuthor(notes, reviewers, writerId),
  };
}
