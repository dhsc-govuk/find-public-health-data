// @vitest-environment jsdom
import type { DataTableColumnValues } from '@fphd/internal-api-features/contract';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { type ActionFunctionArgs, createRoutesStub, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DATA_TABLE, FILTERS } from './check-data.testing.ts';
import { ColumnFilters } from './column-filters.tsx';
import type { ColumnFilterState } from './column-filters-loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const CHECK = `/publish/indicators/${ID}/data-table/check`;
const VALUES = `/publish/indicators/${ID}/data-table/values`;
const PERIODS: DataTableColumnValues = {
  column: 'period',
  values: [
    { id: 'period.1123456789', label: '2020/21' },
    { id: 'period.0123456789', label: '2019/20' },
  ],
  more: false,
};

const NOTHING_FOUND: ColumnFilterState = {
  search: '',
  results: [],
  failed: false,
  opened: [],
  ticked: [],
};

type Props = Parameters<typeof ColumnFilters>[0];

function Address() {
  const { pathname, search } = useLocation();
  return <output>{`${pathname}${search}`}</output>;
}

/** What the search action answers, and every form sent to it. */
function searchAction(answer: (search: string) => Partial<ColumnFilterState>) {
  const sent: string[][] = [];
  const action = async ({ request }: ActionFunctionArgs) => {
    const form = await request.formData();
    sent.push([...form].map(([name, value]) => `${name}=${value}`));
    const search = String(form.get('search'));
    return { ...NOTHING_FOUND, search, ...answer(search) };
  };
  return { sent, action };
}

/** Renders the panel. The stub's `update` re-renders it with other properties. */
function renderPanel(
  props: Partial<Props> = {},
  action: (args: ActionFunctionArgs) => Promise<unknown> = async () => NOTHING_FOUND,
) {
  let update: (next: Partial<Props>) => void = () => {};
  function Panel() {
    const [shown, setShown] = useState(props);
    update = setShown;
    return (
      <>
        <ColumnFilters dataTable={DATA_TABLE} filtersLimited={false} id={ID} {...shown} />
        <Address />
      </>
    );
  }
  const Routes = createRoutesStub([{ path: CHECK, Component: Panel, action }]);
  render(<Routes initialEntries={[CHECK]} />);
  return { update: (next: Partial<Props>) => act(() => update(next)) };
}

/** Answers the values route, with each column's values by the column's key. */
function answerValues(columns: Record<string, DataTableColumnValues | number>) {
  const fetched = vi.fn(async (url: string) => {
    const column = new URL(url, 'https://internal.test').searchParams.get('column') ?? '';
    const answer = columns[column];
    return typeof answer === 'number'
      ? new Response('', { status: answer })
      : Response.json({ columns: answer === undefined ? [] : [answer] });
  });
  vi.stubGlobal('fetch', fetched);
  return fetched;
}

const address = () => document.querySelector('output')?.textContent;
const column = (name: string) => screen.getByRole('button', { name });
const checkboxes = () =>
  screen.getAllByRole('checkbox').map((box) => (box as HTMLInputElement).labels?.[0]?.textContent);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ColumnFilters', () => {
  it('lists the columns of the table, closed, with nothing selected', () => {
    renderPanel();

    const tree = within(screen.getByRole('region', { name: 'Table columns and values' }));
    expect(tree.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Value',
      'Lower CI 95.0 limit',
      'Upper CI 95.0 limit',
      'Period',
      'Area code',
      'Sex',
      'Age',
    ]);
    expect(
      tree.getAllByRole('button').map((button) => button.getAttribute('aria-expanded')),
    ).toEqual(Array(7).fill('false'));
    expect(screen.queryByRole('heading', { name: 'Selected values' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add values/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe(CHECK);
  });

  it('reads the values of a column when it is first opened', async () => {
    const fetched = answerValues({ period: PERIODS });
    renderPanel();

    fireEvent.click(column('Period'));
    expect(screen.getByText('Loading Period…')).toBeTruthy();

    await screen.findByRole('checkbox', { name: '2020/21' });
    expect(checkboxes()).toEqual(['2020/21', '2019/20']);
    expect(column('Period').getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(column('Period'));
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(column('Period'));
    expect(checkboxes()).toEqual(['2020/21', '2019/20']);
    expect(fetched.mock.calls.map(([url]) => url)).toEqual([`${VALUES}?column=period`]);
  });

  it('says when a column has more values than it lists', async () => {
    answerValues({ period: { ...PERIODS, more: true } });
    renderPanel();

    fireEvent.click(column('Period'));

    expect(await screen.findByText('Showing the first 100 — search to find the rest')).toBeTruthy();
  });

  it('closes a column when its request never reaches the app', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    renderPanel();

    fireEvent.click(column('Period'));

    expect(await screen.findByText('Could not load Period. Expand it to try again.')).toBeTruthy();
  });

  it('adds no more values to the address than it takes to say some were left out', async () => {
    const filters = Array.from({ length: 100 }, (_, index) => ({
      id: `value.${String(index).padStart(10, '0')}`,
      label: String(index),
      column: 'value' as const,
    }));
    answerValues({ period: PERIODS });
    renderPanel({ dataTable: { ...DATA_TABLE, filters } });

    fireEvent.click(column('Period'));
    for (const name of ['2020/21', '2019/20']) {
      fireEvent.click(await screen.findByRole('checkbox', { name }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Add values (2)' }));

    await waitFor(() => expect(address()).toContain('f='));
    expect(new URL(`https://internal.test${address()}`).searchParams.getAll('f')).toHaveLength(101);
  });

  it('closes a column it could not read, which opening it again reads', async () => {
    const answers: Record<string, DataTableColumnValues | number> = { period: 502 };
    answerValues(answers);
    renderPanel();

    fireEvent.click(column('Period'));
    expect(await screen.findByText('Could not load Period. Expand it to try again.')).toBeTruthy();
    expect(column('Period').getAttribute('aria-expanded')).toBe('false');

    answers.period = PERIODS;
    fireEvent.click(column('Period'));
    await screen.findByRole('checkbox', { name: '2020/21' });
    expect(screen.queryByText(/Could not load/)).toBeNull();
  });

  it('counts the ticked values, closed columns included, and adds them on the first page', async () => {
    answerValues({
      period: PERIODS,
      sex: {
        column: 'sex',
        values: [{ id: 'sex.2123456789', label: 'Female' }],
        more: false,
      },
    });
    renderPanel({
      dataTable: { ...DATA_TABLE, page: 4, rowsPerPage: 25, filters: FILTERS.slice(0, 1) },
    });

    fireEvent.click(column('Period'));
    fireEvent.click(await screen.findByRole('checkbox', { name: '2020/21' }));
    expect(screen.getByRole('button', { name: 'Add values (1)' })).toBeTruthy();
    fireEvent.click(column('Period'));
    fireEvent.click(column('Sex'));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Female' }));
    expect(address()).toBe(CHECK);

    fireEvent.click(screen.getByRole('button', { name: 'Add values (2)' }));

    await waitFor(() =>
      expect(address()).toBe(
        `${CHECK}?rowsPerPage=25&f=period.0123456789&f=period.1123456789&f=sex.2123456789`,
      ),
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Add values/ })).toBeNull();
  });

  it('does not add a value that is unticked again, or add a selected value twice', async () => {
    answerValues({ period: PERIODS });
    renderPanel({ dataTable: { ...DATA_TABLE, filters: FILTERS.slice(0, 1) } });

    fireEvent.click(column('Period'));
    const selected = await screen.findByRole('checkbox', { name: '2019/20' });
    expect((selected as HTMLInputElement).checked).toBe(false);
    fireEvent.click(selected);
    fireEvent.click(screen.getByRole('checkbox', { name: '2020/21' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '2020/21' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add values (1)' }));

    await waitFor(() => expect(address()).toBe(`${CHECK}?f=period.0123456789`));
  });

  it('moves focus to the selected values once values are added', async () => {
    answerValues({ period: PERIODS });
    const { update } = renderPanel();

    fireEvent.click(column('Period'));
    fireEvent.click(await screen.findByRole('checkbox', { name: '2019/20' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add values (1)' }));
    update({ dataTable: { ...DATA_TABLE, filters: FILTERS.slice(0, 1) } });

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Selected values' }));
  });

  it('shows each selected value with its column, removable on its own or together', () => {
    renderPanel({ dataTable: { ...DATA_TABLE, page: 3, rowsPerPage: 50, filters: FILTERS } });

    expect(
      [...document.querySelectorAll('.fphd-filter-chip')].map((chip) => chip.textContent),
    ).toEqual(['×2019/20 (Period)', '×2020/21 (Period)', '×Female (Sex)']);
    expect(
      screen.getByRole('link', { name: 'Remove 2020/21 (Period) filter' }).getAttribute('href'),
    ).toBe(`${CHECK}?rowsPerPage=50&f=period.0123456789&f=sex.2123456789#column-filters-selected`);
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe(
      `${CHECK}?rowsPerPage=50`,
    );
    expect(screen.queryByText(/You can select up to/)).toBeNull();
  });

  // The remove link goes with its chip, so its fragment says which heading takes focus instead.
  it('moves focus to the selected values after a removal, or to the filters once none are left', () => {
    renderPanel({ dataTable: { ...DATA_TABLE, filters: FILTERS.slice(0, 1) } });

    const remove = screen.getByRole('link', { name: 'Remove 2019/20 (Period) filter' });
    expect(remove.getAttribute('href')).toBe(`${CHECK}#column-filters-heading`);
    const heading = screen.getByRole('heading', { name: 'Column filters' });
    expect(heading.id).toBe('column-filters-heading');
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('heading', { name: 'Selected values' }).id).toBe(
      'column-filters-selected',
    );
  });

  it('says when some filters were left out', () => {
    renderPanel({ dataTable: { ...DATA_TABLE, filters: FILTERS }, filtersLimited: true });

    expect(
      screen.getByText('You can select up to 100 values. Only the first 100 have been selected.'),
    ).toBeTruthy();
  });

  it('searches as the search is typed, listing the columns with matches and their values', async () => {
    const { sent, action } = searchAction(() => ({ results: [PERIODS] }));
    renderPanel({}, action);

    const search = screen.getByLabelText('Add values');
    fireEvent.change(search, { target: { value: '20' } });
    fireEvent.change(search, { target: { value: ' 2020 ' } });
    expect(screen.getByText('Finding values…')).toBeTruthy();

    await screen.findByRole('checkbox', { name: '2020/21' });
    expect(sent).toEqual([['form=column-filters', 'intent=search-values', 'search=2020']]);
    expect(address()).toBe(CHECK);
    expect(screen.queryByRole('button', { name: 'Sex' })).toBeNull();
    expect(screen.queryByText('Finding values…')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: '2020/21' }));
    fireEvent.change(search, { target: { value: '' } });
    expect(column('Sex')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add values (1)' }));
    await waitFor(() => expect(address()).toBe(`${CHECK}?f=period.1123456789`));
  });

  it('empties the search once values are added', async () => {
    const { action } = searchAction(() => ({ results: [PERIODS] }));
    renderPanel({}, action);

    const search = screen.getByLabelText('Add values') as HTMLInputElement;
    fireEvent.change(search, { target: { value: '2020' } });
    fireEvent.click(await screen.findByRole('checkbox', { name: '2020/21' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add values (1)' }));

    await waitFor(() => expect(address()).toBe(`${CHECK}?f=period.1123456789`));
    expect(search.value).toBe('');
    expect(column('Period')).toBeTruthy();
  });

  it('says when no values match the search', async () => {
    const { action } = searchAction(() => ({}));
    renderPanel({}, action);

    fireEvent.change(screen.getByLabelText('Add values'), { target: { value: 'zzz' } });

    expect(await screen.findByText('No values match your search.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sex' })).toBeNull();
  });

  it('says when the search failed, and searches again when it is typed again', async () => {
    let failing = true;
    const { sent, action } = searchAction(() =>
      failing ? { failed: true } : { results: [PERIODS] },
    );
    renderPanel({}, action);

    const search = screen.getByLabelText('Add values');
    fireEvent.change(search, { target: { value: '2020' } });
    expect(
      await screen.findByText('Value search is not working right now. Try again.'),
    ).toBeTruthy();
    expect(column('Period')).toBeTruthy();

    failing = false;
    fireEvent.change(search, { target: { value: '202' } });
    await screen.findByRole('checkbox', { name: '2020/21' });
    expect(sent).toHaveLength(2);
  });

  it('sends a failed search once, and again when the same text is typed again', async () => {
    const { sent, action } = searchAction(() => ({ failed: true }));
    renderPanel({}, action);

    const search = screen.getByLabelText('Add values');
    fireEvent.change(search, { target: { value: '2020' } });
    await screen.findByText('Value search is not working right now. Try again.');
    // Longer than the delay before a search is sent.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(sent).toHaveLength(1);

    fireEvent.change(search, { target: { value: '' } });
    fireEvent.change(search, { target: { value: '2020' } });
    await waitFor(() => expect(sent).toHaveLength(2));
  });

  it('searches again for text it goes back to while a later search is under way', async () => {
    const { sent, action } = searchAction((search) => ({
      results: [
        { ...PERIODS, values: [{ id: 'period.1123456789', label: `Found for ${search}` }] },
      ],
    }));
    let release = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowAction = async (args: ActionFunctionArgs) => {
      const answer = await action(args);
      if (answer.search === '2020') await slow;
      return answer;
    };
    renderPanel({}, slowAction);

    const search = screen.getByLabelText('Add values');
    fireEvent.change(search, { target: { value: '202' } });
    await screen.findByLabelText('Found for 202');
    fireEvent.change(search, { target: { value: '2020' } });
    await waitFor(() => expect(sent).toHaveLength(2));
    fireEvent.change(search, { target: { value: '202' } });
    await waitFor(() => expect(sent).toHaveLength(3));
    release();

    await waitFor(() => expect(screen.queryByText('Finding values…')).toBeNull());
    expect(screen.getByLabelText('Found for 202')).toBeTruthy();
  });

  it('does not add the ticked values when Enter is pressed in the search', async () => {
    answerValues({ period: PERIODS });
    renderPanel();

    fireEvent.click(column('Period'));
    fireEvent.click(await screen.findByRole('checkbox', { name: '2020/21' }));
    const enter = fireEvent.keyDown(screen.getByLabelText('Add values'), { key: 'Enter' });

    expect(enter).toBe(false);
  });

  describe('without JavaScript', () => {
    /** The panel's form as the server renders it, and the buttons that show without scripts. */
    function serverForm(props: Partial<Props>) {
      const Routes = createRoutesStub([
        {
          path: CHECK,
          Component: () => (
            <ColumnFilters dataTable={DATA_TABLE} filtersLimited={false} id={ID} {...props} />
          ),
        },
      ]);
      document.body.innerHTML = renderToStaticMarkup(<Routes initialEntries={[CHECK]} />);
      const form = document.querySelector('form') as HTMLFormElement;
      return {
        form,
        fields: [...new FormData(form)].map(([name, value]) => `${name}=${value}`),
        buttons: [...form.querySelectorAll('noscript')].map(
          ({ innerHTML }) => /value="([^"]*)"/.exec(innerHTML)?.[1],
        ),
      };
    }

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('sends the filters to the page it is on, with a button to search and one for each column', () => {
      const { form, fields, buttons } = serverForm({
        dataTable: { ...DATA_TABLE, page: 2, rowsPerPage: 25, filters: FILTERS.slice(0, 2) },
      });

      expect(form.getAttribute('method')).toBe('post');
      expect(form.getAttribute('action')).toBe(
        `${CHECK}?page=2&rowsPerPage=25&f=period.0123456789&f=period.1123456789`,
      );
      expect(fields).toEqual([
        'form=column-filters',
        'f=period.0123456789',
        'f=period.1123456789',
        'search=',
      ]);
      expect(buttons).toEqual([
        'search-values',
        'show-values-value',
        'show-values-lowerCi95',
        'show-values-upperCi95',
        'show-values-period',
        'show-values-areaCode',
        'show-values-sex',
        'show-values-age',
      ]);
    });

    it('lists the values of the open column, and sends the ticks on them once', () => {
      const { form, fields, buttons } = serverForm({
        state: { ...NOTHING_FOUND, opened: [PERIODS], ticked: ['period.1123456789'] },
      });

      expect(form.querySelectorAll('[type=checkbox]')).toHaveLength(2);
      expect(fields).toEqual([
        'form=column-filters',
        'open=period',
        'search=',
        'f=period.1123456789',
      ]);
      expect(buttons).not.toContain('add-values');
      expect(
        [...form.querySelectorAll('button')].find(
          (button) => button.getAttribute('value') === 'add-values',
        )?.textContent,
      ).toBe('Add values');
    });

    it('lists the values found, keeping the search, the open column and every tick', () => {
      const { form, fields, buttons } = serverForm({
        state: {
          search: '<1',
          results: [
            { column: 'age', values: [{ id: 'age.3123456789', label: '<1 yr' }], more: false },
          ],
          failed: false,
          opened: [PERIODS],
          ticked: ['period.1123456789'],
        },
      });

      expect(form.querySelectorAll('[type=checkbox]')).toHaveLength(1);
      expect(fields).toEqual([
        'form=column-filters',
        'f=period.1123456789',
        'open=period',
        'search=<1',
      ]);
      expect(buttons).toEqual(['search-values']);
    });

    it('says when a column could not be opened, keeping the ticks', () => {
      const { form, fields } = serverForm({
        state: { ...NOTHING_FOUND, failed: true, ticked: ['period.1123456789'] },
      });

      expect(form.textContent).toContain('Value search is not working right now. Try again.');
      expect(fields).toContain('f=period.1123456789');
    });

    it('offers to add values once any are listed, before one is ticked', () => {
      expect(serverForm({ state: { ...NOTHING_FOUND, opened: [PERIODS] } }).buttons.at(-1)).toBe(
        'add-values',
      );
    });
  });
});
