import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient, fails } from '@fphd/web-server/testing';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { BATCH, FILTERS } from './check-data.testing.ts';
import { submitDataTableCheck } from './check-loader.ts';
import {
  ADD_VALUES_INTENT,
  COLUMN_FILTERS_FORM,
  FORM_FIELD,
  SEARCH_VALUES_INTENT,
  showValuesIntent,
} from './column-filters-form.ts';
import { loadDataTableValues } from './column-filters-loader.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const PAGE = `/publish/indicators/${ID}/data-table`;
const VALUES = `/api/internal/indicators/${ID}/data-table/values` as const;
const SEX = { column: 'sex', values: [{ id: 'sex.2123456789', label: 'Female' }], more: false };
const AGE = { column: 'age', values: [{ id: 'age.3123456789', label: '<1 yr' }], more: false };
const [PERIOD] = FILTERS;

function argsFor(api: FakeApiClient, request: Request, id = ID) {
  const context = new RouterContextProvider();
  context.set(apiContext, api);
  return { context, params: { id }, request } as never;
}

/** Sends the form from the check page at `query`, with each `[name, value]`. */
function send(api: FakeApiClient, fields: [string, string][], query = '') {
  const body = new FormData();
  body.set(FORM_FIELD, COLUMN_FILTERS_FORM);
  for (const [name, value] of fields) body.append(name, value);
  return submitDataTableCheck(
    argsFor(
      api,
      new Request(`https://internal.test${PAGE}/check${query}`, { method: 'POST', body }),
    ),
  );
}

describe('loadDataTableValues', () => {
  const load = (api: FakeApiClient, query: string, id = ID) =>
    loadDataTableValues(
      argsFor(api, new Request(`https://internal.test${PAGE}/values${query}`), id),
    );

  it('answers the values of a column', async () => {
    const api = createFakeApiClient({ [`GET ${VALUES}?column=sex`]: { columns: [SEX] } });

    expect(await (await load(api, '?column=sex')).json()).toEqual({ columns: [SEX] });
  });

  it.each(['', '?column=area_code', '?search=Female'])(
    'is not found for %j, without asking the API',
    async (query) => {
      const api = createFakeApiClient();

      await expect(load(api, query)).rejects.toMatchObject({ status: 404 });
      expect(api.calls).toEqual([]);
    },
  );

  it('is not found for an id that is not one, without asking the API', async () => {
    const api = createFakeApiClient();

    await expect(load(api, '?column=sex', 'nope')).rejects.toMatchObject({ status: 404 });
    expect(api.calls).toEqual([]);
  });
});

describe('the column filters form', () => {
  it('finds the values that contain a search, and keeps the open column and the ticks', async () => {
    const api = createFakeApiClient({
      [`GET ${VALUES}?search=%3C1`]: { columns: [AGE] },
      [`GET ${VALUES}?column=sex`]: { columns: [SEX] },
    });

    expect(
      await send(
        api,
        [
          ['intent', SEARCH_VALUES_INTENT],
          ['search', ' <1 '],
          ['open', 'sex'],
          ['f', PERIOD?.id ?? ''],
          ['f', 'sex.2123456789'],
        ],
        `?page=2&f=${PERIOD?.id}`,
      ),
    ).toEqual({
      search: '<1',
      results: [AGE],
      failed: false,
      opened: [SEX],
      ticked: ['sex.2123456789'],
    });
  });

  it('asks the API for nothing when the search is empty and no column is open', async () => {
    const api = createFakeApiClient();

    expect(
      await send(api, [
        ['intent', SEARCH_VALUES_INTENT],
        ['search', ' '],
      ]),
    ).toMatchObject({
      search: '',
      results: [],
      opened: [],
    });
    expect(api.calls).toEqual([]);
  });

  it('never confirms the data table, even with a batch', async () => {
    const api = createFakeApiClient({ [`GET ${VALUES}?search=male`]: { columns: [SEX] } });

    await send(api, [
      ['intent', SEARCH_VALUES_INTENT],
      ['search', 'male'],
      ['batchId', BATCH],
    ]);

    expect(api.calls.map(({ method }) => method)).toEqual(['GET']);
  });

  it.each([
    ['sent by Enter, with no button', []],
    ['with an intent it does not know', [['intent', 'other']]],
    ['with a column it does not have', [['intent', 'show-values-area_code']]],
  ] as [string, [string, string][]][])('searches when %s', async (_, intent) => {
    const api = createFakeApiClient({ [`GET ${VALUES}?search=male`]: { columns: [SEX] } });

    expect(await send(api, [...intent, ['search', 'male']])).toMatchObject({
      search: 'male',
      results: [SEX],
    });
    expect(api.calls.map(({ method }) => method)).toEqual(['GET']);
  });

  const failures: [string, unknown][] = [
    ['failed', new Response(null, { status: 502 })],
    ['timed out', new DOMException('The operation timed out', 'TimeoutError')],
    ['refused the connection', new TypeError('fetch failed')],
  ];

  it.each(failures)('says so when the API %s for a search, keeping the ticks', async (_, error) => {
    const api = createFakeApiClient({
      [`GET ${VALUES}?search=male`]: fails(error),
      [`GET ${VALUES}?column=age`]: { columns: [AGE] },
    });

    expect(
      await send(api, [
        ['search', 'male'],
        ['open', 'age'],
        ['f', 'sex.2123456789'],
      ]),
    ).toEqual({
      search: 'male',
      results: [],
      failed: true,
      opened: [AGE],
      ticked: ['sex.2123456789'],
    });
  });

  it.each(failures)('says so when the API %s for a column, keeping the ticks', async (_, error) => {
    const api = createFakeApiClient({ [`GET ${VALUES}?column=sex`]: fails(error) });

    expect(
      await send(api, [
        ['intent', showValuesIntent('sex')],
        ['f', 'age.3123456789'],
      ]),
    ).toEqual({ search: '', results: [], failed: true, opened: [], ticked: ['age.3123456789'] });
  });

  it('does not hide any other failure', async () => {
    const api = createFakeApiClient({
      [`GET ${VALUES}?search=male`]: fails(new TypeError('x is not a function')),
    });

    await expect(send(api, [['search', 'male']])).rejects.toThrow('x is not a function');
  });

  it('lists the values of a column instead of those searched for', async () => {
    const api = createFakeApiClient({ [`GET ${VALUES}?column=sex`]: { columns: [SEX] } });

    expect(
      await send(api, [
        ['intent', showValuesIntent('sex')],
        ['search', 'male'],
        ['open', 'age'],
      ]),
    ).toMatchObject({ search: '', results: [], opened: [SEX] });
  });

  it('adds the ticked values to the filters, on the first page with the same rows per page', async () => {
    const outcome = await send(
      createFakeApiClient(),
      [
        ['f', PERIOD?.id ?? ''],
        ['f', 'sex.2123456789'],
        ['f', 'sex.2123456789'],
        ['search', '<1'],
        ['intent', ADD_VALUES_INTENT],
      ],
      `?page=3&rowsPerPage=25&f=${PERIOD?.id}`,
    );

    expect((outcome as Response).headers.get('location')).toBe(
      `${PAGE}/check?rowsPerPage=25&f=${PERIOD?.id}&f=sex.2123456789`,
    );
  });

  it('adds no more than it takes to say that some values were left out', async () => {
    const outcome = await send(createFakeApiClient(), [
      ...Array.from({ length: 150 }, (_, index): [string, string] => [
        'f',
        `value.${String(index).padStart(10, '0')}`,
      ]),
      ['intent', ADD_VALUES_INTENT],
    ]);

    const location = (outcome as Response).headers.get('location') ?? '';
    expect(new URL(location, 'https://internal.test').searchParams.getAll('f')).toHaveLength(101);
  });

  it.each<[string, [string, string][], string]>([
    ['a value that is not an id', [['f', 'sex.Female']], ''],
    ['a filter in the address that is not an id', [], '?f=sex.Female'],
  ])('is not found for %s', async (_, fields, query) => {
    await expect(
      send(createFakeApiClient(), [['intent', ADD_VALUES_INTENT], ...fields], query),
    ).rejects.toMatchObject({ status: 404 });
  });
});
