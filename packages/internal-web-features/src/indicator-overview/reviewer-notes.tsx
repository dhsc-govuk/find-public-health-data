import { A, Button, formatDate, Table, Textarea } from '@fphd/ui';

import { VERSION_FIELD } from '../edit-version.ts';
import type { ReviewerNote } from './loader.ts';
import { reviewerNoteEditPath } from './paths.ts';
import { NOTE_ID_FIELD, REVIEWER_NOTE_FIELD, type ReviewerNoteForm } from './reviewer-notes.ts';

interface ReviewerNotesProps {
  /** The indicator the notes are on, whose overview the edit links fill the form on. */
  indicatorId: string;
  notes: readonly ReviewerNote[];
  form: ReviewerNoteForm;
}

/**
 * An assigned reviewer's own notes on the indicator, which nobody else sees, and the form that
 * adds one or, once an Edit link has filled it, saves the note it names.
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
          data={notes.map(({ id, text, updatedAt }) => {
            const date = formatDate(updatedAt, 'longWithTime');
            return {
              date: <time dateTime={updatedAt}>{date}</time>,
              text: <span className="fphd-metadata-text">{text}</span>,
              edit: (
                <A href={reviewerNoteEditPath(indicatorId, id)}>
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
