// @vitest-environment jsdom

import { DATA_TABLE_MAX_BYTES, DATA_TABLE_MESSAGES } from '@fphd/internal-api-features/contract';
import { serviceName } from '@fphd/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BATCH, DATA_TABLE, ROW } from './check-data.testing.ts';
import { DATA_TABLE_CHANGED } from './check-loader.ts';
import type { DataTableProblem } from './loader.ts';
import {
  CheckDataTablePage,
  DataTableProblemsPage,
  pageLinks,
  UploadDataTablePage,
} from './pages.tsx';

afterEach(cleanup);

// What the document's inline script sets in a browser GOV.UK Frontend supports.
beforeEach(() => {
  document.body.classList.add('govuk-frontend-supported');
});

const ID = '00000000-0000-7000-8000-000000000001';

function renderUpload(props: Parameters<typeof UploadDataTablePage>[0] = {}) {
  return render(
    <MemoryRouter initialEntries={[`/publish/indicators/${ID}/data-table`]}>
      <UploadDataTablePage {...props} />
    </MemoryRouter>,
  );
}

function fileField() {
  return screen.getByLabelText('Upload indicator data table') as HTMLInputElement;
}

/** Chooses a file, as the browser's picker would; `size` stands in for a file too big to make. */
function chooseFile(name: string, content = 'area_code\n', size?: number) {
  const file = new File([content], name, { type: 'text/csv' });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  Object.defineProperty(fileField(), 'files', { value: [file], configurable: true });
}

/** Submits the form, answering whether the browser would go on to send it. */
function submit(): boolean {
  return fireEvent.submit(fileField().closest('form') as HTMLFormElement);
}

describe('UploadDataTablePage', () => {
  it('asks for the file with the heading as its label', () => {
    renderUpload();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Upload indicator data table' }),
    ).toBeTruthy();
    expect(fileField().type).toBe('file');
    expect(fileField().name).toBe('dataTable');
    expect(fileField().className).toBe('govuk-file-upload');
  });

  it('posts the file as a multipart form to its own page, with Continue', () => {
    renderUpload();

    const form = fileField().closest('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('enctype')).toBe('multipart/form-data');
    expect(form?.getAttribute('action')).toBeNull();
    expect(within(form as HTMLElement).getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('marks the field and lists the error when the file was refused', () => {
    renderUpload({ fieldErrors: { dataTable: 'The selected file must be a CSV' } });

    expect(document.title).toBe(`Error: Upload indicator data table - ${serviceName} - GOV.UK`);
    expect(
      within(screen.getByRole('alert')).getByRole('link', {
        name: 'The selected file must be a CSV',
      }),
    ).toBeTruthy();
    expect(fileField().className).toContain('govuk-file-upload--error');
    expect(fileField().getAttribute('aria-describedby')).toBe('dataTable-error');
    expect(document.getElementById('dataTable-error')?.textContent).toContain(
      'The selected file must be a CSV',
    );
  });

  it('says nothing about progress until Continue is pressed, then says the upload is under way', () => {
    renderUpload();

    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');

    chooseFile('data.csv');
    submit();

    expect(status.textContent).toBe(
      'Uploading and checking your data table. This can take a few minutes.',
    );
  });

  it('steers the file picker to CSV files', () => {
    renderUpload();

    expect(fileField().getAttribute('accept')).toBe('.csv');
  });

  it.each([
    ['no file is chosen', undefined, DATA_TABLE_MESSAGES.missing],
    ['the file is not a CSV', () => chooseFile('data.xlsx'), DATA_TABLE_MESSAGES.notCsv],
    ['the file is empty', () => chooseFile('data.csv', ''), DATA_TABLE_MESSAGES.empty],
    [
      'the file is over the limit',
      () => chooseFile('data.csv', 'a', DATA_TABLE_MAX_BYTES + 1),
      DATA_TABLE_MESSAGES.tooLarge,
    ],
  ])(
    'refuses without sending anything when %s, as the server would',
    async (_case, choose, message) => {
      renderUpload();
      choose?.();

      expect(submit()).toBe(false);

      const summary = await screen.findByRole('alert');
      expect(within(summary).getByRole('link', { name: message })).toBeTruthy();
      expect(document.getElementById('dataTable-error')?.textContent).toContain(message);
      expect(fileField().className).toContain('govuk-file-upload--error');
      expect(document.title).toBe(`Error: Upload indicator data table - ${serviceName} - GOV.UK`);
      expect(screen.getByRole('status').textContent).toBe('');
      await waitFor(() =>
        expect(document.activeElement).toBe(summary.closest('.govuk-error-summary')),
      );
    },
  );

  it('shows the latest refusal in place of an earlier one', async () => {
    renderUpload({ fieldErrors: { dataTable: DATA_TABLE_MESSAGES.empty } });
    chooseFile('data.xlsx');

    submit();

    const summary = await screen.findByRole('alert');
    expect(
      within(summary)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([DATA_TABLE_MESSAGES.notCsv]);
  });

  it('sends an acceptable file, clearing the refusal and saying the upload is under way', () => {
    renderUpload();
    submit();
    chooseFile('data.csv');

    expect(submit()).toBe(true);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(fileField().className).not.toContain('govuk-file-upload--error');
    expect(screen.getByRole('status').textContent).toContain('Uploading and checking');
  });
});

function renderProblems(problems: DataTableProblem[]) {
  return render(
    <MemoryRouter initialEntries={[`/publish/indicators/${ID}/data-table/problems`]}>
      <DataTableProblemsPage id={ID} problems={problems} />
    </MemoryRouter>,
  );
}

/** Each body row's cells as text. */
function rows() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((tableRow) => [...tableRow.querySelectorAll('th, td')].map((cell) => cell.textContent));
}

describe('DataTableProblemsPage', () => {
  it('heads a table of problems, details and actions', () => {
    renderProblems([{ code: 'no_rows', items: [], count: 1 }]);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'There is a problem with the indicator data table you uploaded',
      }),
    ).toBeTruthy();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Problem',
      'Detail',
      'Actions',
    ]);
  });

  it('gives each missing column a row of its own', () => {
    renderProblems([{ code: 'missing_column', items: ['period_start', 'value'], count: 2 }]);

    expect(rows().map(([problem]) => problem)).toEqual([
      'period_start column missing',
      'value column missing',
    ]);
    expect(rows()[0]?.[1]).toBe(
      'Data table either:does not contain a period_start columnhas a period_start column with a non-standard heading',
    );
  });

  it('lists the unmatched codes with how many instances there are and what to check', () => {
    renderProblems([{ code: 'unmatched_area_codes', items: ['E92000000', 'E93000000'], count: 2 }]);

    expect(rows()).toEqual([
      [
        'Area codes could not be matched to reference data',
        'There are 2 instances of area codes in your data table that could not be matched to the reference data:E92000000E93000000',
        'You should either:check you uploaded the correct data tablecheck the reference data codes you intendedfix the data table and re-upload it',
      ],
    ]);
  });

  it('says the examples are some of them when there are more than it lists', () => {
    renderProblems([{ code: 'invalid_numbers', items: ['4', '9'], count: 1234 }]);

    expect(rows()[0]?.[1]).toBe(
      'There are 1,234 rows in your data table with a number that could not be read, such as one with a thousands separator, a unit or words, including:row 4row 9',
    );
  });

  it('speaks of one in the singular', () => {
    renderProblems([{ code: 'duplicate_rows', items: ['7'], count: 1 }]);

    expect(rows()[0]?.[1]).toBe(
      'There is 1 row in your data table with the same area code, period, sex, age and category as an earlier row:row 7',
    );
  });

  it('names a column heading that is blank', () => {
    renderProblems([{ code: 'unrecognised_columns', items: ['', 'period'], count: 2 }]);

    expect(rows()[0]?.[1]).toContain('(no heading)period');
  });

  it('tells a category column without its partner from rows without one', () => {
    renderProblems([{ code: 'unpaired_category', items: [], count: 1 }]);

    expect(rows()[0]?.[1]).toBe(
      'Your data table has a category_type column without a category column, or a category column without a category_type column.',
    );
  });

  it('offers the upload page again', () => {
    renderProblems([{ code: 'no_rows', items: [], count: 1 }]);

    const again = screen.getByRole('button', { name: 'Upload different or corrected data table' });
    expect(again.getAttribute('href')).toBe(`/publish/indicators/${ID}/data-table`);
  });

  it.each([
    'unreadable',
    'missing_column',
    'unrecognised_columns',
    'repeated_columns',
    'unpaired_category',
    'no_rows',
    'wrong_cell_count',
    'missing_cells',
    'unmatched_area_codes',
    'invalid_periods',
    'unmatched_sexes',
    'unmatched_ages',
    'unmatched_categories',
    'unmatched_value_notes',
    'ambiguous_names',
    'invalid_numbers',
    'duplicate_rows',
  ] as const)('describes %s with a problem, a detail and actions', (code) => {
    renderProblems([{ code, items: ['5'], count: 1 }]);

    const [problem, detail, actions] = rows()[0] ?? [];
    expect(problem).not.toBe('');
    expect(detail).not.toBe('');
    expect(actions).toMatch(/^You should either:check you uploaded the correct data table/);
  });
});

const CHECK = `/publish/indicators/${ID}/data-table/check`;

function renderCheck(props: Partial<Parameters<typeof CheckDataTablePage>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={[CHECK]}>
      <CheckDataTablePage id={ID} dataTable={DATA_TABLE} totalPages={5237} {...props} />
    </MemoryRouter>,
  );
}

describe('CheckDataTablePage', () => {
  it('introduces the table with what the upload contains', () => {
    renderCheck();

    expect(document.title).toBe(`Check the indicator data table - ${serviceName} - GOV.UK`);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Check the indicator data table' }),
    ).toBeTruthy();
    expect(screen.getByText('Your upload contains 52,365 rows')).toBeTruthy();
  });

  it('tells apart rows that differ only by category type, in a column of its own', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const decile = { ...ROW, sex: null, category: 'Most deprived decile' };
    renderCheck({
      dataTable: {
        ...DATA_TABLE,
        columns: ['area_code', 'period_start', 'period_end', 'value', 'category_type', 'category'],
        rows: [
          { ...decile, dimensionKey: 'imd-2019-decile-1', categoryType: 'IMD 2019 deciles' },
          { ...decile, dimensionKey: 'imd-2015-decile-1', categoryType: 'IMD 2015 deciles' },
        ],
      },
    });

    const table = within(screen.getByRole('region', { name: 'Data table' })).getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Data values', 'Period', 'Area code', 'Category type', 'Category']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ['83.8', '2019/20', 'E92000001', 'IMD 2019 deciles', 'Most deprived decile'],
      ['83.8', '2019/20', 'E92000001', 'IMD 2015 deciles', 'Most deprived decile'],
    ]);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('shows the page of rows under the headings of the columns the file had', () => {
    renderCheck();

    const table = within(screen.getByRole('region', { name: 'Data table' })).getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'Data values',
      'Lower CI 95.0 limit',
      'Upper CI 95.0 limit',
      'Period',
      'Area code',
      'Sex',
      'Age',
    ]);
    const [, row] = within(table).getAllByRole('row');
    expect(within(row as HTMLElement).queryAllByRole('rowheader')).toEqual([]);
    expect(
      within(row as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['83.8', '83.7', '83.9', '2019/20', 'E92000001', 'Female', '']);
    expect(screen.getByText('Showing 1 to 10 of 52,365 rows')).toBeTruthy();
  });

  it('offers 10, 25 or 50 rows per page, with the current number chosen', () => {
    renderCheck({ dataTable: { ...DATA_TABLE, rowsPerPage: 25 } });

    const select = screen.getByLabelText('Rows per page') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(['10', '25', '50']);
    expect(select.value).toBe('25');
    expect(select.name).toBe('rowsPerPage');
    const form = select.closest('form');
    expect(form?.getAttribute('method')).toBe('get');
    expect(within(form as HTMLElement).getByRole('button', { name: 'Apply' })).toBeTruthy();
  });

  it('links to the pages around the current one, keeping the rows per page', () => {
    renderCheck({ dataTable: { ...DATA_TABLE, page: 3, rowsPerPage: 25 }, totalPages: 2095 });

    const pages = within(screen.getByRole('navigation', { name: 'Data table pages' }));
    expect(pages.getByRole('link', { name: '3' }).getAttribute('aria-current')).toBe('page');
    expect(pages.getByRole('link', { name: '2095' }).getAttribute('href')).toBe(
      `${CHECK}?page=2095&rowsPerPage=25`,
    );
    expect(pages.getByRole('link', { name: '1' }).getAttribute('href')).toBe(
      `${CHECK}?rowsPerPage=25`,
    );
    expect(pages.getByRole('link', { name: /Next/ }).getAttribute('href')).toBe(
      `${CHECK}?page=4&rowsPerPage=25`,
    );
  });

  it('leaves out the page links when the rows fit on one page', () => {
    renderCheck({ dataTable: { ...DATA_TABLE, rowCount: 1 }, totalPages: 1 });

    expect(screen.queryByRole('navigation', { name: 'Data table pages' })).toBeNull();
  });

  it('confirms the batch shown with Continue, or offers a different table', () => {
    renderCheck();

    expect(screen.getByText('By continuing, you confirm the data table is correct.')).toBeTruthy();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    const form = continueButton.closest('form') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe(CHECK);
    expect(new FormData(form).get('batchId')).toBe(BATCH);
    expect(
      screen.getByRole('button', { name: 'Choose a different data table' }).getAttribute('href'),
    ).toBe(`/publish/indicators/${ID}/data-table`);
  });

  it('says why when the table was replaced before Continue', () => {
    renderCheck({ formError: DATA_TABLE_CHANGED });

    expect(document.title).toBe(`Error: Check the indicator data table - ${serviceName} - GOV.UK`);
    expect(within(screen.getByRole('alert')).getByText(DATA_TABLE_CHANGED)).toBeTruthy();
  });
});

describe('pageLinks', () => {
  it('fills only the first, last and neighbouring pages, leaving holes for the rest', () => {
    const links = pageLinks(99_000, 500, (page) => page);

    expect(links).toHaveLength(99_000);
    expect(Object.values(links)).toEqual([1, 499, 500, 501, 99_000]);
  });

  it('fills no page twice at either end', () => {
    expect(Object.values(pageLinks(3, 1, (page) => page))).toEqual([1, 2, 3]);
    expect(Object.values(pageLinks(3, 3, (page) => page))).toEqual([1, 2, 3]);
  });

  it('is rendered by Pagination as those pages, with ellipses for the holes', () => {
    renderCheck({ dataTable: { ...DATA_TABLE, page: 500 }, totalPages: 5237 });

    const pages = screen.getByRole('navigation', { name: 'Data table pages' });
    expect(
      within(pages)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Previous page', '1', '499', '500', '501', '5237', 'Next page']);
    expect(pages.querySelectorAll('.govuk-pagination__item--ellipsis')).toHaveLength(2);
  });
});
