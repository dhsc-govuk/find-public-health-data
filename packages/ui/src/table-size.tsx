const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** The table's size for screen reader users, read after its caption: rows exclude headings. */
export function TableSize({ rows, columns }: { rows: number; columns: number }) {
  return (
    <span className="govuk-visually-hidden">
      , table with {plural(rows, 'row')} and {plural(columns, 'column')}
    </span>
  );
}
