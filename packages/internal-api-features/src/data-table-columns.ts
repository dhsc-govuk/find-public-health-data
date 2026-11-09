import { isOneOf } from '@fphd/utils/is-one-of';
import type { DataTableFinding } from './data-table-problems.ts';

/** Every column a data table may have, each under one heading. */
export const DATA_TABLE_COLUMNS = [
  'area_code',
  'period_start',
  'period_end',
  'value',
  'count',
  'numerator',
  'denominator',
  'lower_ci_95',
  'upper_ci_95',
  'lower_ci_998',
  'upper_ci_998',
  'sex',
  'age',
  'category_type',
  'category',
  'value_note',
] as const;

export type DataTableColumn = (typeof DATA_TABLE_COLUMNS)[number];

const REQUIRED_COLUMNS: readonly DataTableColumn[] = [
  'area_code',
  'period_start',
  'period_end',
  'value',
];

/** Where each column is in a row, for the columns the table has. */
export type ColumnPositions = Partial<Record<DataTableColumn, number>>;

/** The headings as rows are read against them. */
export interface Header {
  /** Where each recognised column first appears. */
  positions: ColumnPositions;
  /** How many cells every row must have: one per heading. */
  columnCount: number;
  /** Everything wrong with the headings. The rows are still read for what else they show. */
  findings: DataTableFinding[];
}

function isColumn(heading: string): heading is DataTableColumn {
  return isOneOf(DATA_TABLE_COLUMNS, heading);
}

/** Headings match regardless of case and surrounding spaces. */
function headingKey(cell: string): string {
  return cell.trim().toLowerCase();
}

/** The recognised columns among a file's headings, in the file's order. */
export function columnsOf(cells: readonly string[]): DataTableColumn[] {
  return cells.map(headingKey).filter(isColumn);
}

/** Any heading it doesn't recognise means the file is refused. */
export function readHeader(cells: readonly string[]): Header {
  const headings = cells.map(headingKey);
  const recognised = headings.filter(isColumn);
  const repeated = recognised.filter((heading, index) => recognised.indexOf(heading) !== index);

  const findings: DataTableFinding[] = [
    ...REQUIRED_COLUMNS.filter((column) => !recognised.includes(column)).map((column) => ({
      code: 'missing_column' as const,
      item: column,
    })),
    ...headings
      .filter((heading) => !isColumn(heading))
      .map((heading) => ({ code: 'unrecognised_columns' as const, item: heading })),
    ...[...new Set(repeated)].map((heading) => ({
      code: 'repeated_columns' as const,
      item: heading,
    })),
    ...(recognised.includes('category_type') === recognised.includes('category')
      ? []
      : [{ code: 'unpaired_category' as const }]),
  ];

  return {
    positions: Object.fromEntries(
      headings.flatMap((heading, index) =>
        isColumn(heading) && headings.indexOf(heading) === index ? [[heading, index]] : [],
      ),
    ),
    columnCount: headings.length,
    findings,
  };
}
