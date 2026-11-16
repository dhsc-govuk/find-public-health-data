import { describe, expect, it } from 'vitest';
import { DATA_TABLE, ROW } from './check-data.testing.ts';
import { checkColumns, dataChanges, rowsShowing, uploadSummary } from './check-data.ts';

function cells(row = ROW, columns = DATA_TABLE.columns, yearType = DATA_TABLE.yearType) {
  return Object.fromEntries(
    checkColumns(columns).map(({ heading, cell }) => [heading, cell(row, yearType)]),
  );
}

describe('checkColumns', () => {
  it('shows the columns the file had, the period once for its two dates', () => {
    expect(checkColumns(DATA_TABLE.columns).map(({ heading }) => heading)).toEqual([
      'Data values',
      'Lower CI 95.0 limit',
      'Upper CI 95.0 limit',
      'Period',
      'Area code',
      'Sex',
      'Age',
    ]);
  });

  it('shows every column a file can have, in order', () => {
    const columns = checkColumns([
      'value_note',
      'category',
      'category_type',
      'age',
      'sex',
      'upper_ci_998',
      'lower_ci_998',
      'upper_ci_95',
      'lower_ci_95',
      'denominator',
      'numerator',
      'count',
      'value',
      'period_end',
      'period_start',
      'area_code',
    ]);

    expect(columns.map(({ heading }) => heading)).toEqual([
      'Data values',
      'Lower CI 95.0 limit',
      'Upper CI 95.0 limit',
      'Lower CI 99.8 limit',
      'Upper CI 99.8 limit',
      'Count',
      'Numerator',
      'Denominator',
      'Period',
      'Area code',
      'Sex',
      'Age',
      'Category type',
      'Category',
      'Value note',
    ]);
  });

  it('shows numbers as loaded, and an empty number as nothing', () => {
    expect(cells({ ...ROW, value: 1500, lowerCi95: 0.000_01, upperCi95: null })).toMatchObject({
      'Data values': '1500',
      'Lower CI 95.0 limit': '0.00001',
      'Upper CI 95.0 limit': '',
    });
  });

  it("labels the period by its dates and the draft's year type", () => {
    expect(cells().Period).toBe('2019/20');
    expect(cells({ ...ROW, fromDate: '2026-01-01', toDate: '2026-03-31' }).Period).toBe(
      'January to March 2026',
    );
    expect(cells(ROW, DATA_TABLE.columns, { value: 'rolling', label: 'Rolling' }).Period).toBe(
      'April 2019 to March 2020',
    );
  });

  it('leaves the sex and age blank for a row stored without them', () => {
    expect(cells({ ...ROW, sex: null, age: null })).toMatchObject({ Sex: '', Age: '' });
  });

  it('shows a category with its type, and the value notes', () => {
    const columns = ['area_code', 'category_type', 'category', 'value_note'] as const;
    const row = {
      ...ROW,
      categoryType: 'Ethnic groups',
      category: 'White',
      valueNotes: ['Aggregated from values for merged CCGs', 'Value suppressed'],
    };

    expect(cells(row, [...columns])).toMatchObject({
      'Category type': 'Ethnic groups',
      Category: 'White',
      'Value note': 'Aggregated from values for merged CCGs; Value suppressed',
    });
    expect(cells(ROW, [...columns])).toMatchObject({ Category: '', 'Value note': '' });
  });
});

describe('uploadSummary', () => {
  it('counts the rows, with separators', () => {
    expect(uploadSummary(DATA_TABLE)).toBe('Your upload contains 52,365 rows');
    expect(uploadSummary({ ...DATA_TABLE, rowCount: 1 })).toBe('Your upload contains 1 row');
  });
});

describe('rowsShowing', () => {
  it('says which rows the page shows', () => {
    expect(rowsShowing(DATA_TABLE)).toBe('Showing 1 to 10 of 52,365 rows');
    expect(rowsShowing({ ...DATA_TABLE, page: 1048, rowsPerPage: 50 })).toBe(
      'Showing 52,351 to 52,365 of 52,365 rows',
    );
  });
});

describe('dataChanges', () => {
  it("counts an update's new data values as replacing the live ones, with separators", () => {
    expect(dataChanges({ ...DATA_TABLE, replacesPublished: true })).toEqual([
      { label: 'Number of data values replaced', count: '52,365' },
    ]);
  });

  it('counts nothing for a new indicator or an update still on the live data table', () => {
    expect(dataChanges(DATA_TABLE)).toEqual([]);
  });
});
