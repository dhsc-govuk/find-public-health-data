import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiAnswer,
  type FakeApiCall,
  type FakeApiClient,
  type FakeApiStub,
  type FakeApiStubs,
  fails,
} from '@fphd/web-server/testing';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { loadIndicatorCsv } from './csv.ts';
import { indicatorDetail } from './view.testing.ts';

const SLUG = 'mortality-all-causes';
const DETAIL = `/api/indicators/${SLUG}` as const;

const detail = indicatorDetail(108, {
  slug: SLUG,
  name: 'Mortality, "all causes"',
  unit: 'per 100,000',
  yearType: { value: 'calendar', label: 'Calendar' },
});

function observation(overrides = {}) {
  return {
    fromDate: '2023-01-01',
    toDate: '2023-12-31',
    value: 341.1,
    lowerCi95: 339,
    upperCi95: 343.2,
    lowerCi998: null,
    upperCi998: null,
    count: 130000,
    numerator: null,
    denominator: null,
    notes: [],
    dimensions: [],
    ...overrides,
  };
}

function args(api: FakeApiClient, url: string, slug = SLUG) {
  const context = new RouterContextProvider();
  context.set(apiContext, api);
  return {
    context,
    params: { slug },
    request: new Request(url),
  } as unknown as LoaderFunctionArgs;
}

function areaCodes(call: FakeApiCall) {
  return new URL(`http://localhost${call.path}`).searchParams.getAll('areaCode');
}

/**
 * Answers the indicator, by slug or number, and its data with `areaData`. The API answers a
 * query of one area with that area alone, and of several with a list.
 */
function api(areaData: FakeApiAnswer[] | FakeApiStub, stubs: FakeApiStubs = {}) {
  return createFakeApiClient({
    [`GET ${DETAIL}`]: detail,
    'GET /api/indicators/108': detail,
    [`GET ${DETAIL}/data`]: Array.isArray(areaData)
      ? (call: FakeApiCall) => (areaCodes(call).length === 1 ? (areaData[0] ?? null) : areaData)
      : areaData,
    ...stubs,
  });
}

function paths(client: FakeApiClient) {
  return client.calls.map(({ path }) => path);
}

describe('loadIndicatorCsv', () => {
  it('serves the trend table as an attachment, quoting fields that need it', async () => {
    const client = api([
      { areaCode: 'E92000001', areaName: 'England', observations: [observation()] },
    ]);

    const response = await loadIndicatorCsv(
      args(client, 'http://localhost/indicator/mortality-all-causes/table.csv'),
      'table',
    );

    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="108-table.csv"',
    );
    const body = await response.text();
    expect(body).toContain('Period,England count,"England calculated value (per 100,000)"');
    expect(body).toContain('2023,130000,341.1');
  });

  it('adds no unit to the headings of values that have none', async () => {
    const client = api(
      [{ areaCode: 'E92000001', areaName: 'England', observations: [observation()] }],
      { [`GET ${DETAIL}`]: { ...detail, unit: null } },
    );

    const response = await loadIndicatorCsv(
      args(client, 'http://localhost/indicator/mortality-all-causes/table.csv'),
      'table',
    );

    expect(await response.text()).toContain('Period,England count,England calculated value\n');
  });

  it('loads the linked areas with England riding along and filters the trend by options', async () => {
    const client = api([
      {
        areaCode: 'E06000052',
        areaName: 'Cornwall',
        observations: [
          observation({
            value: 1,
            dimensions: [{ type: 'Sex', value: 'Male', dimensionClass: 'core', sortOrder: 1 }],
          }),
          observation({
            value: 2,
            dimensions: [{ type: 'Sex', value: 'Female', dimensionClass: 'core', sortOrder: 2 }],
          }),
        ],
      },
      { areaCode: 'E92000001', areaName: 'England', observations: [] },
    ]);

    const response = await loadIndicatorCsv(
      args(
        client,
        'http://localhost/indicator/mortality-all-causes/table.csv?as=E06000052&sex-108=Male',
      ),
      'table',
    );

    expect(paths(client)).toContain(`${DETAIL}/data?areaCode=E06000052&areaCode=E92000001`);
    const body = await response.text();
    expect(body).toContain('2023,130000,1');
    expect(body).not.toContain('2023,130000,2');
  });

  it('serves every observation with segments and notes in the all-data download', async () => {
    const client = api([
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: [
          observation({
            dimensions: [{ type: 'Sex', value: 'Male', dimensionClass: 'core', sortOrder: 1 }],
            notes: [{ text: 'Provisional', category: 'Data quality' }],
          }),
        ],
      },
    ]);

    const response = await loadIndicatorCsv(
      args(client, 'http://localhost/indicator/mortality-all-causes/all-data.csv'),
      'all-data',
    );

    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="108-all-data.csv"',
    );
    const body = await response.text();
    expect(body).toContain('Segment');
    expect(body).toContain('Male');
    expect(body).toContain('Provisional');
    expect(body).toContain(',England,England,2023,');
    expect(paths(client).some((path) => path.includes('/areas'))).toBe(false);
  });

  it('exports every published area in bounded batches with a single CSV header', async () => {
    const areas = Array.from({ length: 23 }, (_, index) => ({
      code: `E${String(index).padStart(8, '0')}`,
      name: `Area ${index}`,
    }));
    const client = api(
      (call) =>
        areaCodes(call).map((code) => ({
          areaCode: code,
          areaName: areas.find((area) => area.code === code)?.name ?? '',
          observations: [observation()],
        })),
      { [`GET ${DETAIL}/areas`]: [{ displayGroup: 'Statistical regions', areas }] },
    );
    const response = await loadIndicatorCsv(
      args(client, `http://localhost/indicator/${SLUG}/all-data.csv?allAreas=yes`),
      'all-data',
    );
    const csv = await response.text();
    expect(
      csv.split('\n').filter((line) => line.startsWith('Indicator,Area,Area type,Period')),
    ).toHaveLength(1);
    expect(csv).toContain('Area 22');
    const sizes = client.calls
      .filter(({ path }) => path.includes('/data?'))
      .map((call) => areaCodes(call).length);
    expect(sizes).toEqual([20, 3]);
  });

  it("names each area's type beside it in the all-areas download", async () => {
    const groups = [
      { displayGroup: 'England', areas: [{ code: 'E92000001', name: 'England' }] },
      {
        displayGroup: 'Local authorities',
        areas: [
          { code: 'E10000032', name: 'West Sussex' },
          { code: 'E07000223', name: 'Adur' },
          { code: 'E06000043', name: 'Brighton and Hove' },
        ],
      },
      { displayGroup: 'Integrated care boards', areas: [{ code: 'E54000064', name: 'Sussex' }] },
    ];
    const names = new Map(
      groups.flatMap(({ areas }) => areas.map(({ code, name }) => [code, name])),
    );
    const client = api(
      (call) =>
        areaCodes(call).map((code) => ({
          areaCode: code,
          areaName: names.get(code) ?? '',
          observations: [observation()],
        })),
      { [`GET ${DETAIL}/areas`]: groups },
    );
    const response = await loadIndicatorCsv(
      args(client, `http://localhost/indicator/${SLUG}/all-data.csv?allAreas=yes`),
      'all-data',
    );
    const lines = (await response.text()).trim().split(/\r?\n/);
    expect(lines[0]?.startsWith('Indicator,Area,Area type,Period,')).toBe(true);
    // The indicator name holds a comma and quotes, so read the fields after its closing quote.
    expect(
      lines.slice(1).map((line) =>
        line
          .slice(line.lastIndexOf('"') + 2)
          .split(',')
          .slice(0, 3),
      ),
    ).toEqual([
      ['England', 'England', '2023'],
      ['West Sussex', 'Upper tier local authority', '2023'],
      ['Adur', 'Lower tier local authority', '2023'],
      ['Brighton and Hove', 'Upper and lower tier local authority', '2023'],
      ['Sussex', 'Integrated care board', '2023'],
    ]);
  });

  it('ignores a sex the data does not publish rather than serving an empty table', async () => {
    const client = api([
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: [
          observation({
            value: 7,
            dimensions: [{ type: 'Sex', value: 'Male', dimensionClass: 'core', sortOrder: 1 }],
          }),
        ],
      },
    ]);

    const response = await loadIndicatorCsv(
      args(client, 'http://localhost/indicator/mortality-all-causes/table.csv?sex-108=Unpublished'),
      'table',
    );

    expect(await response.text()).toContain('2023,130000,7');
  });

  it('offers only the first area sexes, exactly as the page does', async () => {
    const client = api([
      { areaCode: 'E06000052', areaName: 'Cornwall', observations: [observation({ value: 9 })] },
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: [
          observation({
            value: 5,
            dimensions: [{ type: 'Sex', value: 'Male', dimensionClass: 'core', sortOrder: 1 }],
          }),
        ],
      },
    ]);

    const response = await loadIndicatorCsv(
      args(
        client,
        'http://localhost/indicator/mortality-all-causes/table.csv?as=E06000052&sex-108=Male',
      ),
      'table',
    );

    // Male exists only in England's series, so the filter is ignored, not applied.
    expect(await response.text()).toContain('2023,130000,9');
  });

  it('404s a segment shaped like neither identifier without calling the api', async () => {
    const client = createFakeApiClient();

    await expect(
      loadIndicatorCsv(args(client, 'http://localhost/indicator/x/table.csv', '../x'), 'table'),
    ).rejects.toMatchObject({ status: 404 });
    expect(client.calls).toEqual([]);
  });

  it('301s a download addressed by number to the canonical slug, query string and all', async () => {
    const client = api([
      { areaCode: 'E92000001', areaName: 'England', observations: [observation()] },
    ]);

    await expect(
      loadIndicatorCsv(
        args(client, 'http://localhost/indicator/108/table.csv?as=E06000052', '108'),
        'table',
      ),
    ).rejects.toMatchObject({
      status: 301,
      headers: expect.anything(),
    });
  });

  it('redirects before asking for any data', async () => {
    const client = api([]);

    await loadIndicatorCsv(
      args(client, 'http://localhost/indicator/108/table.csv?as=E06000052', '108'),
      'table',
    ).catch(() => undefined);

    expect(paths(client)).toEqual(['/api/indicators/108']);
  });

  it('names the redirect target after the canonical slug', async () => {
    const client = api([
      { areaCode: 'E92000001', areaName: 'England', observations: [observation()] },
    ]);

    const redirected = await loadIndicatorCsv(
      args(client, 'http://localhost/indicator/108/all-data.csv?as=E06000052', '108'),
      'all-data',
    ).catch((response: Response) => response);

    expect((redirected as Response).headers.get('location')).toBe(
      `/indicator/${SLUG}/all-data.csv?as=E06000052`,
    );
  });
});

it('rejects an all-areas download body if a later data batch fails', async () => {
  const areas = Array.from({ length: 23 }, (_, index) => ({
    code: `E${String(index).padStart(8, '0')}`,
    name: `Area ${index}`,
  }));
  let batches = 0;
  const failure = new Response(null, { status: 502 });
  const client = api(
    () => {
      batches += 1;
      return batches === 2 ? fails(failure) : [];
    },
    { [`GET ${DETAIL}/areas`]: [{ displayGroup: 'Local authorities', areas }] },
  );
  const response = await loadIndicatorCsv(
    args(client, `http://localhost/indicator/${SLUG}/all-data.csv?allAreas=yes`),
    'all-data',
  );
  await expect(response.text()).rejects.toBe(failure);
});

it('propagates an initial all-areas API failure before returning an attachment', async () => {
  const failure = new Response(null, { status: 502 });
  const client = api(fails(failure), {
    [`GET ${DETAIL}/areas`]: [
      { displayGroup: 'NHS regions', areas: [{ code: 'E40000001', name: 'Region' }] },
    ],
  });
  await expect(
    loadIndicatorCsv(
      args(client, `http://localhost/indicator/${SLUG}/all-data.csv?allAreas=yes`),
      'all-data',
    ),
  ).rejects.toBe(failure);
});
