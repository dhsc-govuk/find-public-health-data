import { formatDate, Markdown } from '@fphd/ui';

import type { ChangeLine, ChangeRow, DiffRun, HistoryItem, HistoryRow } from './loader.ts';

/** An entry's Section and Comments table, named by the entry's action. */
function RowsTable({ labelledBy, rows }: { labelledBy: string; rows: readonly HistoryRow[] }) {
  return (
    <table aria-labelledby={labelledBy} className="govuk-table fphd-history-table">
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

/** Free text as it changed: the words removed struck through, and the words added highlighted. */
function Diff({ runs }: { runs: readonly DiffRun[] }) {
  return runs.map(({ change, text }, index) => {
    // Runs carry no id, and the list of runs never changes once rendered.
    const key = index;
    if (change === 'removed') {
      return (
        <del className="fphd-diff-removed" key={key}>
          <span className="govuk-visually-hidden">Removed: </span>
          {text}
        </del>
      );
    }
    if (change === 'added') {
      return (
        <ins className="fphd-diff-added" key={key}>
          <span className="govuk-visually-hidden">Added: </span>
          {text}
        </ins>
      );
    }
    return <span key={key}>{text}</span>;
  });
}

function ChangeLines({ lines }: { lines: readonly ChangeLine[] }) {
  return lines.map(({ label, change }, index) => (
    // Lines carry no id, and the list of lines never changes once rendered.
    <div className="fphd-history-change" key={index}>
      {label === null ? null : <span className="fphd-history-change__label">{label}</span>}
      <p className="govuk-body-s govuk-!-margin-bottom-0">
        {change.kind === 'diff' ? <Diff runs={change.runs} /> : change.text}
      </p>
    </div>
  ));
}

/** An update's Section and Changes table, named by the entry's action. */
function ChangesTable({ labelledBy, rows }: { labelledBy: string; rows: readonly ChangeRow[] }) {
  return (
    <table aria-labelledby={labelledBy} className="govuk-table fphd-history-table">
      <thead className="govuk-table__head">
        <tr className="govuk-table__row">
          <th scope="col" className="govuk-table__header">
            Section
          </th>
          <th scope="col" className="govuk-table__header">
            Changes
          </th>
        </tr>
      </thead>
      <tbody className="govuk-table__body">
        {rows.map(({ section, lines }) => (
          <tr className="govuk-table__row" key={section}>
            <td className="govuk-table__cell">{section}</td>
            <td className="govuk-table__cell">
              <ChangeLines lines={lines} />
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
        {items.map(({ date, action, by, rows, changes = [] }, index) => {
          // Entries carry no id, and the list changes only with a new page.
          const actionId = `history-action-${index}`;
          return (
            <li className="fphd-history-entry" key={index}>
              <p className="govuk-body govuk-!-font-weight-bold govuk-!-margin-bottom-1">
                <time dateTime={date}>{formatDate(date, 'long')}</time>
              </p>
              <p className="govuk-body govuk-!-margin-bottom-1" id={actionId}>
                {action}
              </p>
              {by === null ? null : (
                <p className="govuk-body fphd-body-italic govuk-!-margin-bottom-0">By {by}</p>
              )}
              {rows.length === 0 ? null : <RowsTable labelledBy={actionId} rows={rows} />}
              {changes.length === 0 ? null : <ChangesTable labelledBy={actionId} rows={changes} />}
            </li>
          );
        })}
      </ol>
    </>
  );
}
