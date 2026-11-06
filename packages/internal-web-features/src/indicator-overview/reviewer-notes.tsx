import { A, Button, formatDate, Table, Textarea } from '@fphd/ui';

import { VERSION_FIELD } from '../edit-version.ts';
import type { AuthorNotes, ReviewerNote } from './loader.ts';
import { reviewerNoteEditPath } from './paths.ts';
import { NOTE_ID_FIELD, REVIEWER_NOTE_FIELD, type ReviewerNoteForm } from './reviewer-note-form.ts';

/** A note's date and text, as every notes table shows them. */
function noteCells({ text, updatedAt }: ReviewerNote) {
  return {
    date: <time dateTime={updatedAt}>{formatDate(updatedAt, 'longWithTime')}</time>,
    text: <span className="fphd-metadata-text">{text}</span>,
  };
}

interface ReviewerNotesProps {
  /** The indicator the notes are on, whose overview the edit links fill the form on. */
  indicatorId: string;
  notes: readonly ReviewerNote[];
  form: ReviewerNoteForm;
}

/**
 * An assigned reviewer's own notes on the indicator and the form that adds one or, once an Edit
 * link has filled it, saves the note it names.
 */
export function ReviewerNotes({ indicatorId, notes, form }: ReviewerNotesProps) {
  const { values, fieldErrors } = form;
  const editing = values.noteId !== '';

  return (
    <>
      <h3 className="govuk-heading-m govuk-!-margin-top-4">Your notes</h3>
      {notes.length === 0 ? null : (
        <Table
          headings={{ date: 'Date', text: 'Notes', edit: 'Edit link' }}
          keys={['date', 'text', 'edit']}
          data={notes.map((note) => {
            const date = formatDate(note.updatedAt, 'longWithTime');
            return {
              ...noteCells(note),
              edit: (
                <A href={reviewerNoteEditPath(indicatorId, note.id)}>
                  Edit<span className="govuk-visually-hidden"> the note from {date}</span>
                </A>
              ),
            };
          })}
        />
      )}
      {/* A plain form posting back to the overview, so it works without JavaScript. */}
      <form method="post">
        {editing ? (
          <>
            <input name={NOTE_ID_FIELD} type="hidden" value={values.noteId} />
            <input name={VERSION_FIELD} type="hidden" value={values.version} />
          </>
        ) : null}
        <Textarea
          defaultValue={values.reviewerNote}
          error={fieldErrors.reviewerNote}
          // A new key when an Edit link fills the form, so the textarea takes the note's text.
          key={values.noteId}
          label="Enter any notes as part of your indicator review"
          name={REVIEWER_NOTE_FIELD}
          rows={5}
        />
        <Button classModifiers="secondary" preventDoubleClick type="submit">
          {editing ? 'Update notes' : 'Add notes'}
        </Button>
      </form>
    </>
  );
}

/** Other reviewers' notes, read only: a section for each, headed with their name. */
export function OtherReviewerNotes({ authors }: { authors: readonly AuthorNotes[] }) {
  return authors.map(({ author, notes }) => (
    <section key={author.id}>
      <h3 className="govuk-heading-m govuk-!-margin-top-4">{author.name}'s notes</h3>
      {notes.length === 0 ? (
        <p className="govuk-body">No notes added</p>
      ) : (
        <Table
          headings={{ date: 'Date', text: 'Notes' }}
          keys={['date', 'text']}
          data={notes.map(noteCells)}
        />
      )}
    </section>
  ));
}
