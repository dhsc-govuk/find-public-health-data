import {
  ALL_AGES_NAME,
  ALL_SEXES_NAME,
  type CheckColumnKey,
  checkColumnKeys,
  type DataTableCheck,
  type DataTableColumn,
  type DataTableFilter,
  type DataTableRow,
} from '@fphd/internal-api-features/contract';
import { periodLabel } from '@fphd/utils/period-label';

type CheckedTable = NonNullable<DataTableCheck['dataTable']>;
type YearType = CheckedTable['yearType'];

/** A column in the check page's table. */
export interface CheckColumn {
  key: CheckColumnKey;
  heading: string;
  cell: (row: DataTableRow, yearType: YearType) => string;
}

/** Numbers as they were loaded, without separators or rounding. */
function number(value: number | null): string {
  return value === null ? '' : String(value);
}

const COLUMNS: Record<CheckColumnKey, Omit<CheckColumn, 'key'>> = {
  count: { heading: 'Count', cell: (row) => number(row.count) },
  numerator: { heading: 'Numerator', cell: (row) => number(row.numerator) },
  denominator: { heading: 'Denominator', cell: (row) => number(row.denominator) },
  value: { heading: 'Value', cell: (row) => number(row.value) },
  lowerCi95: { heading: 'Lower CI 95.0 limit', cell: (row) => number(row.lowerCi95) },
  upperCi95: { heading: 'Upper CI 95.0 limit', cell: (row) => number(row.upperCi95) },
  lowerCi998: { heading: 'Lower CI 99.8 limit', cell: (row) => number(row.lowerCi998) },
  upperCi998: { heading: 'Upper CI 99.8 limit', cell: (row) => number(row.upperCi998) },
  period: { heading: 'Period', cell: (row, yearType) => periodLabel(row, yearType) },
  areaCode: { heading: 'Area code', cell: (row) => row.areaCode },
  // A total is stored without the sex or age, so its empty cell shows the name a file gives it.
  sex: { heading: 'Sex', cell: (row) => row.sex ?? ALL_SEXES_NAME },
  age: { heading: 'Age', cell: (row) => row.age ?? ALL_AGES_NAME },
  categoryType: { heading: 'Category type', cell: (row) => row.categoryType ?? '' },
  category: { heading: 'Category', cell: (row) => row.category ?? '' },
  valueNote: { heading: 'Value note', cell: (row) => row.valueNotes.join('; ') },
};

/** The check page's columns for the columns a file included, in display order. */
export function checkColumns(fileColumns: readonly DataTableColumn[]): CheckColumn[] {
  return checkColumnKeys(fileColumns).map((key) => ({ key, ...COLUMNS[key] }));
}

/** A selected value with the column it is in: "2025 (Period)". */
export function filterLabel({ column, label }: DataTableFilter): string {
  return `${label} (${COLUMNS[column].heading})`;
}

const count = new Intl.NumberFormat('en-GB');

function rows(n: number): string {
  return `${count.format(n)} ${n === 1 ? 'row' : 'rows'}`;
}

/** The sentence above the table saying how many rows the upload has. */
export function uploadSummary({ rowCount }: CheckedTable): string {
  return `Your upload contains ${rows(rowCount)}`;
}

/** Which rows this page shows, out of those that match the filters. */
export function rowsShowing({
  page,
  rowsPerPage,
  matchingRowCount,
  filters,
}: CheckedTable): string {
  if (matchingRowCount === 0 && filters.length > 0) return 'No rows match these filters';
  const first = (page - 1) * rowsPerPage + 1;
  const last = Math.min(page * rowsPerPage, matchingRowCount);
  return `Showing ${count.format(first)} to ${count.format(last)} of ${rows(matchingRowCount)}`;
}

/** One count in the summary above an update's data table. */
export interface DataChange {
  label: string;
  count: string;
}

/**
 * The counts above the table on an update: how many data values the new table holds, as all of
 * them replace the live indicator's. A new indicator has no live data, so it has none.
 */
export function dataChanges({ rowCount, replacesPublished }: CheckedTable): DataChange[] {
  return replacesPublished
    ? [{ label: 'Number of data values replaced', count: count.format(rowCount) }]
    : [];
}
