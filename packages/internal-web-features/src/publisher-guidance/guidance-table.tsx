import type { ReactNode } from 'react';

import type { GuidanceAnchor } from './paths.ts';

export interface GuidanceRow {
  /** The row's id, for the rows a section page's guidance link points at. */
  anchor?: GuidanceAnchor;
  /** The first column, which heads the row. */
  header: string;
  /** The other columns, in the order of the table's headings. */
  cells: readonly ReactNode[];
}

interface GuidanceTableProps {
  /** Every column's heading, the first being the row headers' column. */
  headings: readonly string[];
  /** The heading the table sits under, which names it. */
  labelledBy: GuidanceAnchor;
  rows: readonly GuidanceRow[];
  /** Sets the columns' widths for the tables whose content needs more room in one column. */
  variant?: 'fields' | 'markdown';
}

/** A table on the guidance page, whose cells can hold paragraphs, lists and examples. */
export function GuidanceTable({ headings, labelledBy, rows, variant }: GuidanceTableProps) {
  const className = [
    'govuk-table',
    'fphd-guidance-table',
    variant && `fphd-guidance-table--${variant}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <table aria-labelledby={labelledBy} className={className}>
      <thead className="govuk-table__head">
        <tr className="govuk-table__row">
          {headings.map((heading) => (
            <th className="govuk-table__header" key={heading} scope="col">
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="govuk-table__body">
        {rows.map(({ anchor, header, cells }) => (
          <tr className="govuk-table__row" key={header}>
            <th className="govuk-table__header" id={anchor} scope="row">
              {header}
            </th>
            {cells.map((cell, index) => (
              <td className="govuk-table__cell" key={headings[index + 1]}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The guidance for one question a publisher answers, with examples of a good answer. */
export interface FieldGuidance {
  anchor: GuidanceAnchor;
  header: string;
  guidance: ReactNode;
  /** Each example is wrapped in an `Example`. */
  examples?: ReactNode;
}

interface FieldGuidanceTableProps {
  fields: readonly FieldGuidance[];
  labelledBy: GuidanceAnchor;
  exampleHeading?: 'Example' | 'Examples';
}

/** A table of questions, the guidance on answering each, and examples of an answer. */
export function FieldGuidanceTable({
  exampleHeading = 'Example',
  fields,
  labelledBy,
}: FieldGuidanceTableProps) {
  return (
    <GuidanceTable
      headings={['Field', 'Guidance', exampleHeading]}
      labelledBy={labelledBy}
      rows={fields.map(({ anchor, header, guidance, examples = null }) => ({
        anchor,
        header,
        cells: [guidance, examples],
      }))}
      variant="fields"
    />
  );
}

/**
 * One example in a field's Examples column. A rule separates it from the example before, so an
 * example can run to several paragraphs and still read as one.
 */
export function Example({ children }: { children: ReactNode }) {
  return <div className="fphd-guidance-example">{children}</div>;
}
