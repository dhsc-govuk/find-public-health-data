import { formatDate, Markdown } from '@fphd/ui';

import type { HistoryItem, HistoryRow } from './loader.ts';

function RowsTable({ rows }: { rows: readonly HistoryRow[] }) {
  return (
    <table className="govuk-table fphd-history-table">
      <thead className="govuk-table__head">
        <tr className="govuk-table__row">
          <th scope="col" className="govuk-table__header">
            Section
          </th>
          <th scope="col" className="govuk-table__header">
            Comments
          </th>
        </tr>
      </thead>
      <tbody className="govuk-table__body">
        {rows.map(({ section, comments }) => (
          <tr className="govuk-table__row" key={section}>
            <td className="govuk-table__cell">{section}</td>
            <td className="govuk-table__cell">
              {typeof comments === 'string' ? comments : <Markdown html={comments} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The History tab: what has happened to the indicator, newest first. */
export function History({ items }: { items: readonly HistoryItem[] }) {
  return (
    <>
      <h2 className="govuk-heading-m">History</h2>
      <ol className="fphd-history-list">
        {items.map(({ date, action, by, rows }, index) => (
          // Entries carry no id, and the list changes only with a new page.
          <li className="fphd-history-entry" key={index}>
            <p className="govuk-body govuk-!-font-weight-bold govuk-!-margin-bottom-1">
              <time dateTime={date}>{formatDate(date, 'long')}</time>
            </p>
            <p className="govuk-body govuk-!-margin-bottom-1">{action}</p>
            {by === null ? null : (
              <p className="govuk-body fphd-body-italic govuk-!-margin-bottom-0">By {by}</p>
            )}
            {rows.length === 0 ? null : <RowsTable rows={rows} />}
          </li>
        ))}
      </ol>
    </>
  );
}
