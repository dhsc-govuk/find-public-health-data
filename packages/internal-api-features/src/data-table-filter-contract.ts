import { z } from '@fphd/config/zod';

import type { DataTableColumn } from './data-table-columns.ts';

/** The check page's columns in display order, each with the file columns it displays. */
const CHECK_COLUMNS = {
  count: ['count'],
  numerator: ['numerator'],
  denominator: ['denominator'],
  value: ['value'],
  lowerCi95: ['lower_ci_95'],
  upperCi95: ['upper_ci_95'],
  lowerCi998: ['lower_ci_998'],
  upperCi998: ['upper_ci_998'],
  period: ['period_start', 'period_end'],
  areaCode: ['area_code'],
  sex: ['sex'],
  age: ['age'],
  categoryType: ['category_type'],
  category: ['category'],
  valueNote: ['value_note'],
} as const satisfies Record<string, readonly DataTableColumn[]>;

export type CheckColumnKey = keyof typeof CHECK_COLUMNS;

export const CHECK_COLUMN_KEYS = Object.keys(CHECK_COLUMNS) as CheckColumnKey[];

/** The check page's columns for a file: those that display any column the file included. */
export function checkColumnKeys(fileColumns: readonly DataTableColumn[]): CheckColumnKey[] {
  return CHECK_COLUMN_KEYS.filter((key) =>
    CHECK_COLUMNS[key].some((column) => fileColumns.includes(column)),
  );
}

/** The most values the data table can be filtered by at once, which keeps its address short. */
export const MAX_DATA_TABLE_FILTERS = 100;

/** The most values of one column that are listed to choose from. */
export const MAX_LISTED_DATA_TABLE_VALUES = 100;

/** How long a search for a column's values may be. */
export const DATA_TABLE_SEARCH_MAX_LENGTH = 100;

/**
 * Identifies a value of a column, as `<column>.<hash of the value>`. The hash is of the value, or
 * of a period's dates, and not of its place in an upload. Periods that share a label are one value
 * with the hash of the latest, which another upload can change. The hash stands in for the value in
 * addresses because DAC's gateway refuses an address that contains characters such as `<` or too
 * many hyphens, which values can.
 */
export const dataTableFilterIdSchema = z
  .string()
  .regex(new RegExp(`^(?:${CHECK_COLUMN_KEYS.join('|')})\\.[0-9a-f]{10}$`));

/** The values chosen in a query string: none, one, or a repeated key. */
export const dataTableFilterIdsSchema = z
  .union([z.string(), z.array(z.string())])
  .default([])
  .transform((ids) => [...new Set([ids].flat())])
  .pipe(z.array(dataTableFilterIdSchema));

const checkColumnKeySchema = z.enum(CHECK_COLUMN_KEYS);

/** A value of a column, labelled as the check page's table shows it. */
export const dataTableValueSchema = z.object({
  id: dataTableFilterIdSchema,
  label: z.string(),
});

/** A value the data table is filtered by. */
export const dataTableFilterSchema = dataTableValueSchema.extend({ column: checkColumnKeySchema });

/** Asks for a column's values, the values in any column that contain a search, or both. */
export const dataTableValuesQuerySchema = z
  .object({
    column: checkColumnKeySchema.optional(),
    search: z.string().trim().max(DATA_TABLE_SEARCH_MAX_LENGTH).default(''),
  })
  .refine(({ column, search }) => column !== undefined || search !== '');

/** The values of one column, up to the most that are listed. `more` is true if it has others. */
export const dataTableColumnValuesSchema = z.object({
  column: checkColumnKeySchema,
  values: z.array(dataTableValueSchema),
  more: z.boolean(),
});

export const dataTableValuesSchema = z.object({ columns: z.array(dataTableColumnValuesSchema) });

export type DataTableValue = z.infer<typeof dataTableValueSchema>;
export type DataTableFilter = z.infer<typeof dataTableFilterSchema>;
export type DataTableValuesQuery = z.infer<typeof dataTableValuesQuerySchema>;
export type DataTableColumnValues = z.infer<typeof dataTableColumnValuesSchema>;
export type DataTableValues = z.infer<typeof dataTableValuesSchema>;
