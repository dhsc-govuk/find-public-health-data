import { formatDate, Table } from '@fphd/ui';

import type { ReviewerNote } from './loader.ts';

/** An assigned reviewer's own notes on the indicator, which nobody else sees. */
export function ReviewerNotes({ notes }: { notes: readonly ReviewerNote[] }) {
  return (
    <>
      <h3 className="govuk-heading-m">Your notes</h3>
      {notes.length === 0 ? null : (
        <Table
          headings={{ date: 'Date', text: 'Notes' }}
          keys={['date', 'text']}
          data={notes.map(({ text, updatedAt }) => ({
            date: <time dateTime={updatedAt}>{formatDate(updatedAt, 'longWithTime')}</time>,
            text: <span className="fphd-metadata-text">{text}</span>,
          }))}
        />
      )}
    </>
  );
}
