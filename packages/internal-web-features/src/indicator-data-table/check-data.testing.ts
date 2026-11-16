import type { DataTableCheck, DataTableRow } from '@fphd/internal-api-features/contract';

export const BATCH = '00000000-0000-7000-8000-000000000003';

export const ROW: DataTableRow = {
  areaCode: 'E92000001',
  fromDate: '2019-04-01',
  toDate: '2020-03-31',
  dimensionKey: '00000000-0000-7000-8000-000000000004',
  value: 83.8,
  count: null,
  numerator: null,
  denominator: null,
  lowerCi95: 83.7,
  upperCi95: 83.9,
  lowerCi998: null,
  upperCi998: null,
  sex: 'Female',
  age: null,
  categoryType: null,
  category: null,
  valueNotes: [],
};

/** A loaded table of 52,365 rows on its first page, as the API answers it. */
export const DATA_TABLE: NonNullable<DataTableCheck['dataTable']> = {
  batchId: BATCH,
  columns: [
    'area_code',
    'period_start',
    'period_end',
    'value',
    'lower_ci_95',
    'upper_ci_95',
    'sex',
    'age',
  ],
  rowCount: 52_365,
  yearType: null,
  replacesPublished: false,
  page: 1,
  rowsPerPage: 10,
  rows: [ROW],
};
