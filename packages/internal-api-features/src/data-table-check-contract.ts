import { z } from '@fphd/config/zod';
import { YEAR_TYPES } from '@fphd/utils/period-type';

import { DATA_TABLE_COLUMNS } from './data-table-columns.ts';

export type { DataTableColumn } from './data-table-columns.ts';

/** The numbers of rows a page of the data table can show; the first is the default. */
export const DATA_TABLE_ROWS_PER_PAGE = ['10', '25', '50'] as const;

/** Read from the query string, so both values arrive as text. Defaults to page 1, 10 rows. */
export const dataTablePageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
  rowsPerPage: z.enum(DATA_TABLE_ROWS_PER_PAGE).default('10').transform(Number),
});

const number = z.number().nullable();

/** One uploaded row, with its area, sex, age and category as the codes and names in the file. */
export const dataTableRowSchema = z.object({
  areaCode: z.string(),
  fromDate: z.iso.date(),
  toDate: z.iso.date(),
  /** Together with the area code and dates, identifies the row within its batch. */
  dimensionKey: z.string(),
  value: number,
  count: number,
  numerator: number,
  denominator: number,
  lowerCi95: number,
  upperCi95: number,
  lowerCi998: number,
  upperCi998: number,
  sex: z.string().nullable(),
  age: z.string().nullable(),
  categoryType: z.string().nullable(),
  category: z.string().nullable(),
  valueNotes: z.array(z.string()),
});

/**
 * One page of the draft's uploaded data table, or null if no file has been uploaded yet. It has
 * the columns the file included, the total number of rows, and the rows on this page. Confirming
 * the table sends back `batchId`. `yearType` is the draft's, and is used to label the periods.
 * `replacesPublished` is true on an update whose draft has a data table of its own, which replaces
 * all of the live indicator's data values.
 */
export const dataTableCheckSchema = z.object({
  dataTable: z
    .object({
      batchId: z.uuid(),
      columns: z.array(z.enum(DATA_TABLE_COLUMNS)),
      rowCount: z.number().int().min(0),
      yearType: z.object({ value: z.enum(YEAR_TYPES), label: z.string().min(1) }).nullable(),
      replacesPublished: z.boolean(),
      page: z.number().int().min(1),
      rowsPerPage: z.number().int().min(1),
      rows: z.array(dataTableRowSchema),
    })
    .nullable(),
});

/** Confirms the batch shown on the check page. Refused if the draft has a newer upload. */
export const dataTableConfirmationSchema = z.object({ batchId: z.uuid() });

export const dataTableConfirmedSchema = z.object({ confirmedAt: z.iso.datetime() });

export const dataTableConfirmationErrorSchema = z.object({
  error: z.enum(['invalid_id', 'validation_failed', 'data_table_changed', 'locked']),
});

export type DataTablePageQuery = z.infer<typeof dataTablePageQuerySchema>;
export type DataTableRow = z.infer<typeof dataTableRowSchema>;
export type DataTableCheck = z.infer<typeof dataTableCheckSchema>;
export type DataTableConfirmation = z.infer<typeof dataTableConfirmationSchema>;
export type DataTableConfirmed = z.infer<typeof dataTableConfirmedSchema>;
export type DataTableConfirmationError = z.infer<typeof dataTableConfirmationErrorSchema>;
