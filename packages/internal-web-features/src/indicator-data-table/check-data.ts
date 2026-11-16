import type {
  DataTableCheck,
  DataTableColumn,
  DataTableRow,
} from '@fphd/internal-api-features/contract';
import { periodLabel } from '@fphd/utils/period-label';

type CheckedTable = NonNullable<DataTableCheck['dataTable']>;
type YearType = CheckedTable['yearType'];

/** A column in the check page's table. It's shown if the file included any of its columns. */
export interface CheckColumn {
  key: string;
  heading: string;
  /** The file columns this column displays. */
  from: readonly DataTableColumn[];
  cell: (row: DataTableRow, yearType: YearType) => string;
}

/** Numbers as they were loaded, without separators or rounding. */
function number(value: number | null): string {
  return value === null ? '' : String(value);
}

const COLUMNS: readonly CheckColumn[] = [
  { key: 'value', heading: 'Data values', from: ['value'], cell: (row) => number(row.value) },
  {
    key: 'lowerCi95',
    heading: 'Lower CI 95.0 limit',
    from: ['lower_ci_95'],
    cell: (row) => number(row.lowerCi95),
  },
  {
    key: 'upperCi95',
    heading: 'Upper CI 95.0 limit',
    from: ['upper_ci_95'],
    cell: (row) => number(row.upperCi95),
  },
  {
    key: 'lowerCi998',
    heading: 'Lower CI 99.8 limit',
    from: ['lower_ci_998'],
    cell: (row) => number(row.lowerCi998),
  },
  {
    key: 'upperCi998',
    heading: 'Upper CI 99.8 limit',
    from: ['upper_ci_998'],
    cell: (row) => number(row.upperCi998),
  },
  { key: 'count', heading: 'Count', from: ['count'], cell: (row) => number(row.count) },
  {
    key: 'numerator',
    heading: 'Numerator',
    from: ['numerator'],
    cell: (row) => number(row.numerator),
  },
  {
    key: 'denominator',
    heading: 'Denominator',
    from: ['denominator'],
    cell: (row) => number(row.denominator),
  },
  {
    key: 'period',
    heading: 'Period',
    from: ['period_start', 'period_end'],
    cell: (row, yearType) => periodLabel(row, yearType),
  },
  { key: 'areaCode', heading: 'Area code', from: ['area_code'], cell: (row) => row.areaCode },
  { key: 'sex', heading: 'Sex', from: ['sex'], cell: (row) => row.sex ?? '' },
  { key: 'age', heading: 'Age', from: ['age'], cell: (row) => row.age ?? '' },
  {
    key: 'categoryType',
    heading: 'Category type',
    from: ['category_type'],
    cell: (row) => row.categoryType ?? '',
  },
  { key: 'category', heading: 'Category', from: ['category'], cell: (row) => row.category ?? '' },
  {
    key: 'valueNote',
    heading: 'Value note',
    from: ['value_note'],
    cell: (row) => row.valueNotes.join('; '),
  },
];

/** The check page's columns for the columns a file included, in display order. */
export function checkColumns(fileColumns: readonly DataTableColumn[]): CheckColumn[] {
  return COLUMNS.filter(({ from }) => from.some((column) => fileColumns.includes(column)));
}

const count = new Intl.NumberFormat('en-GB');

function rows(n: number): string {
  return `${count.format(n)} ${n === 1 ? 'row' : 'rows'}`;
}

/** The sentence above the table saying how many rows the upload has. */
export function uploadSummary({ rowCount }: CheckedTable): string {
  return `Your upload contains ${rows(rowCount)}`;
}

/** Which rows this page shows, out of the total. */
export function rowsShowing({ page, rowsPerPage, rowCount }: CheckedTable): string {
  const first = (page - 1) * rowsPerPage + 1;
  const last = Math.min(page * rowsPerPage, rowCount);
  return `Showing ${count.format(first)} to ${count.format(last)} of ${rows(rowCount)}`;
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
