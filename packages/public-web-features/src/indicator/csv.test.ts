import { indicatorPageDetailSchema } from '@fphd/public-api-features/contract';
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
import { benchmarkFixture } from './benchmark.testing.ts';
import { loadIndicatorCsv } from './csv.ts';
import { indicatorPageContext } from './page-context.ts';
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
  it('exports both IMD value and spread groups, neighbour means, CA values and goal verdicts in table order', async () => {
    const fixture = benchmarkFixture();
    const client = api([], {
      [`GET ${DETAIL}`]: { ...fixture.detail, slug: SLUG },
      [`GET ${DETAIL}/data`]: (call: FakeApiCall) => {
        const data = areaCodes(call).flatMap(
          (code) =>
            [...fixture.areaData, ...fixture.regionData, ...fixture.benchmarkData].find(
              ({ areaCode }) => areaCode === code,
            ) ?? { areaCode: code, areaName: code, observations: [] },
        );
        return data.length === 1 ? data[0] : data;
      },
      'GET /api/areas/lookup': fixture.lookup,
      'GET /api/areas/parents': Object.entries(fixture.geography.regionByCode).map(
        ([code, parent]) => ({ code, parentCode: parent.code, parentName: parent.name }),
      ),
      [`GET ${DETAIL}/range`]: { periods: fixture.ranges['england:upper'] ?? [] },
    });
    const query = new URLSearchParams([
      ['as', 'E08000003'],
      ['as', 'E06000052'],
      ['columns-108', 'value,minmax,percentiles,goal'],
      ...fixture.benchmarks.map((choice) => ['cmp-108', choice]),
    ]);
    const response = await loadIndicatorCsv(
      args(client, `http://localhost/indicator/${SLUG}/table.csv?${query}`),
      'table',
    );
    const csv = await response.text();
    const names = [
      'England',
      'North West (Statistical region)',
      'South West (Statistical region)',
      'Decile 1 (IMD 2019)',
      'Decile 2 (IMD 2019)',
      'Decile 1 (IMD 2025)',
      'Decile 2 (IMD 2025)',
    ];
    expect(csv.split('\n')[0]).toBe(
      [
        'Period',
        'Manchester calculated value (%)',
        'Cornwall calculated value (%)',
        ...names.flatMap((name) => [
          `${name} calculated value (%)`,
          `${name} lowest`,
          `${name} 25th percentile`,
          `${name} 75th percentile`,
          `${name} highest`,
        ]),
        'Manchester compared with policy goal',
        'Cornwall compared with policy goal',
        'Statistical neighbours (Manchester) calculated value (%)',
        'Statistical neighbours (Cornwall) calculated value (%)',
        'Combined authority (Manchester) calculated value (%)',
        'Combined authority (Cornwall) calculated value (%)',
      ].join(','),
    );
    expect(csv.split('\n')[1]).toBe(
      '2024,3,8,5,1,2,20,30,5,1,2,20,30,6,1,2,20,30,7,1,2,20,30,9,1,2,20,30,8,1,2,20,30,10,1,2,20,30,Good,Bad,15,15,9,',
    );
    expect(paths(client).filter((path) => path.includes('/range?category=')).length).toBe(4);
    expect(paths(client).filter((path) => path.startsWith('/api/areas/lookup?'))).toEqual([
      '/api/areas/lookup?areaCode=E08000003&areaCode=E06000052&includeBenchmarks=true',
    ]);
    expect(paths(client).filter((path) => path.startsWith('/api/areas/parents?'))).toEqual([
      '/api/areas/parents?areaCode=E08000003&areaCode=E06000052&parentType=Regions%20(statistical)',
    ]);
    expect(paths(client).some((path) => path.startsWith('/api/areas/neighbours?'))).toBe(false);
    expect(
      paths(client).some((path) =>
        path.includes(
          '/data?areaCode=E08000001&areaCode=E08000002&areaCode=E47000002&areaCode=E47000001',
        ),
      ),
    ).toBe(true);
  });

  it('exports England goal verdicts without selected areas', async () => {
    const fixture = benchmarkFixture();
    const client = api([fixture.areaData[2] ?? null], {
      [`GET ${DETAIL}`]: { ...fixture.detail, slug: SLUG },
    });
    const response = await loadIndicatorCsv(
      args(
        client,
        `http://localhost/indicator/${SLUG}/table.csv?cmp-108=goal&columns-108=value,goal`,
      ),
      'table',
    );
    expect(await response.text()).toBe(
      'Period,England calculated value (%),England compared with policy goal\n2024,5,Neither good nor bad\n',
    );
  });
  it('exports England and a shared region once after all selected area columns', async () => {
    const area = (areaCode: string, areaName: string, value: number) => ({
      areaCode,
      areaName,
      observations: [observation({ value, lowerCi95: value - 1, upperCi95: value + 1 })],
    });
    const data = [
      area('E06000052', 'Cornwall', 14),
      area('E10000008', 'Devon', 18),
      area('E92000001', 'England', 12),
      area('E12000009', 'South West', 15),
    ];
    const client = api([], {
      [`GET ${DETAIL}/data`]: (call: FakeApiCall) => {
        const rows = areaCodes(call).flatMap(
          (code) => data.find(({ areaCode }) => areaCode === code) ?? [],
        );
        return rows.length === 1 ? rows[0] : rows;
      },
      'GET /api/areas/lookup': data.slice(0, 2).map(({ areaCode, areaName }) => ({
        code: areaCode,
        name: areaName,
        areaType: 'Unitary authority',
        displayGroup: 'Local authorities',
      })),
      'GET /api/areas/parents': data.slice(0, 2).map(({ areaCode }) => ({
        code: areaCode,
        parentCode: 'E12000009',
        parentName: 'South West',
      })),
      [`GET ${DETAIL}/range`]: (call: FakeApiCall) => ({
        periods: [
          {
            fromDate: '2023-01-01',
            toDate: '2023-12-31',
            segment: '',
            min: 5,
            p25: 10,
            p75: 20,
            max: call.path.includes('parent=') ? 25 : 30,
          },
        ],
      }),
    });
    const response = await loadIndicatorCsv(
      args(
        client,
        `http://localhost/indicator/${SLUG}/table.csv?as=E06000052&as=E10000008&cmp-108=&cmp-108=region&cmp-108=england&cmp-108=england`,
      ),
      'table',
    );
    const [header, row] = (await response.text()).trim().split('\n');
    expect(header).toBe(
      [
        'Period',
        ...['Cornwall', 'Devon'].flatMap((name) => [
          `${name} calculated value (per 100,000)`,
          `${name} lower 95% CI`,
          `${name} upper 95% CI`,
        ]),
        ...['England', 'South West (Statistical region)'].flatMap((name) => [
          `${name} calculated value (per 100,000)`,
          `${name} lowest`,
          `${name} 25th percentile`,
          `${name} 75th percentile`,
          `${name} highest`,
        ]),
      ]
        .map((label) => (label.includes(',') ? `"${label}"` : label))
        .join(','),
    );
    expect(row).toBe('2023,14,13,15,18,17,19,12,5,10,20,30,15,5,10,20,25');
    expect(paths(client).filter((path) => path.includes('/range?'))).toHaveLength(2);
  });

  it.each(['england', 'region'])(
    'exports the default %s spread without a columns parameter',
    async (benchmark) => {
      const client = api(
        [
          { areaCode: 'E06000052', areaName: 'Cornwall', observations: [observation()] },
          {
            areaCode: 'E92000001',
            areaName: 'England',
            observations: [observation({ value: 300 })],
          },
        ],
        {
          'GET /api/areas/lookup': [
            {
              code: 'E06000052',
              name: 'Cornwall',
              areaType: 'Unitary authority',
              displayGroup: 'Local authorities',
            },
          ],
          'GET /api/areas/parents': [
            { code: 'E06000052', parentCode: 'E12000009', parentName: 'South West' },
          ],
          [`GET ${DETAIL}/range`]: {
            periods: [
              {
                fromDate: '2023-01-01',
                toDate: '2023-12-31',
                segment: '',
                min: 200,
                p25: 250,
                p75: 350,
                max: 400,
              },
            ],
          },
        },
      );
      const url = `http://localhost/indicator/${SLUG}/table.csv?as=E06000052&cmp-108=${benchmark}`;
      const response = await loadIndicatorCsv(args(client, url), 'table');
      const csv = await response.text();
      const explicit = await loadIndicatorCsv(
        args(client, `${url}&columns-108=value,95,minmax,percentiles,chart`),
        'table',
      );

      expect(csv).toBe(await explicit.text());
      expect(csv.split('\n')[0]).toMatch(/lowest,.*25th percentile,.*75th percentile,.*highest$/);
      expect(csv).toContain(',200,250,350,400\n');
      expect(csv).not.toContain('Cornwall count');
      expect(paths(client)).toContain(
        `${DETAIL}/range?tier=upper${benchmark === 'region' ? '&parent=E12000009' : ''}`,
      );
    },
  );

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
    expect(body).toContain(
      'Period,"England calculated value (per 100,000)",England lower 95% CI,England upper 95% CI',
    );
    expect(body).toContain('2023,341.1,339,343.2');
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

    expect(await response.text()).toContain(
      'Period,England calculated value,England lower 95% CI,England upper 95% CI\n',
    );
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
    expect(body).toContain('2023,1,339,343.2');
    expect(body).not.toContain('2023,2,339,343.2');
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

  it('looks up only the selected areas its GSS code cannot name', async () => {
    const client = api(
      [
        { areaCode: 'W06000015', areaName: 'Cardiff', observations: [observation()] },
        { areaCode: 'E92000001', areaName: 'England', observations: [observation()] },
      ],
      {
        'GET /api/areas/lookup': [
          {
            code: 'W06000015',
            name: 'Cardiff',
            areaType: 'LA unchanged',
            displayGroup: 'Local authorities',
          },
        ],
      },
    );
    const response = await loadIndicatorCsv(
      args(client, `http://localhost/indicator/${SLUG}/all-data.csv?as=W06000015`),
      'all-data',
    );
    const body = await response.text();
    expect(body).toContain(',Cardiff,Local authority,2023,');
    expect(body).toContain(',England,England,2023,');
    const lookups = client.calls.filter(({ path }) => path.startsWith('/api/areas/lookup'));
    expect(lookups.map(areaCodes)).toEqual([['W06000015']]);
  });

  it('labels a code listed under two groups by the first group', async () => {
    const client = api(
      [{ areaCode: 'Y00001', areaName: 'Practice', observations: [observation()] }],
      {
        [`GET ${DETAIL}/areas`]: [
          { displayGroup: 'GP practices', areas: [{ code: 'Y00001', name: 'Practice' }] },
          { displayGroup: 'PCNs (v. 26/06/25)', areas: [{ code: 'Y00001', name: 'Practice' }] },
        ],
      },
    );
    const response = await loadIndicatorCsv(
      args(client, `http://localhost/indicator/${SLUG}/all-data.csv?allAreas=yes`),
      'all-data',
    );
    expect(await response.text()).toContain(',Practice,GP practice,2023,');
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

    expect(await response.text()).toContain('2023,7,339,343.2');
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
    expect(await response.text()).toContain('2023,9,339,343.2');
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

describe('the table download of an indicator with no England value', () => {
  const regionData = (code: string, value: number) => ({
    areaCode: code,
    areaName: code === 'E12000001' ? 'North East' : 'North West',
    observations: [observation({ value })],
  });
  const data = (call: FakeApiCall) => {
    const answers = areaCodes(call).map((code) =>
      code === 'E92000001'
        ? { areaCode: code, areaName: 'England', observations: [] }
        : regionData(code, code === 'E12000001' ? 10 : 20),
    );
    return answers.length === 1 ? answers[0] : answers;
  };
  const areas = (levels: string[]) => (call: FakeApiCall) => {
    const group = new URL(call.path, 'http://api').searchParams.get('displayGroup');
    const regions = {
      displayGroup: 'Statistical regions',
      areas: [
        { code: 'E12000001', name: 'North East' },
        { code: 'E12000002', name: 'North West' },
      ],
    };
    if (group) return group === 'Statistical regions' ? [regions] : [];
    return levels.map((displayGroup) => ({ displayGroup, areas: [] }));
  };

  it("holds the page's default regions when nothing is chosen", async () => {
    const client = api(data, {
      [`GET ${DETAIL}/areas`]: areas(['Local authorities', 'Statistical regions']),
    });

    const response = await loadIndicatorCsv(
      args(client, `http://localhost/indicator/${SLUG}/table.csv`),
      'table',
    );

    const [header, row] = (await response.text()).split('\n');
    expect(header).toContain('North East');
    expect(header).toContain('North West');
    expect(row).toContain('10');
  });

  it('holds only its header when the indicator has data for neither kind of region', async () => {
    const client = api(data, { [`GET ${DETAIL}/areas`]: areas(['Local authorities']) });

    const response = await loadIndicatorCsv(
      args(client, `http://localhost/indicator/${SLUG}/table.csv`),
      'table',
    );

    expect((await response.text()).trim().split('\n')).toEqual(['Period']);
  });

  it('asks for no default level when England has a value', async () => {
    const client = api([
      { areaCode: 'E92000001', areaName: 'England', observations: [observation()] },
    ]);

    await loadIndicatorCsv(args(client, `http://localhost/indicator/${SLUG}/table.csv`), 'table');

    expect(paths(client).some((path) => path.includes('/areas'))).toBe(false);
  });
});

describe('a route that shows the page at one address, as the preview does', () => {
  function previewArgs(api: FakeApiClient, url: string, segment: string) {
    const loaderArgs = args(api, url, segment);
    loaderArgs.context.set(indicatorPageContext, {
      detailSchema: indicatorPageDetailSchema,
      links: {
        page: () => '/preview',
        csv: (_slug, kind) => `/preview/${kind}.csv`,
        metadata: () => '/preview/metadata.txt',
        geographies: '/preview/geographies',
        indicatorSearch: '/preview/indicators/search',
        compareAreas: '/preview/compare-areas',
      },
    });
    return loaderArgs;
  }

  it('answers not found for a draft with no data to show, asking for nothing more', async () => {
    const api = createFakeApiClient({
      'GET /api/indicators/108': { ...detail, dataState: 'no-upload', unanswered: [] },
    });

    const answer = loadIndicatorCsv(
      previewArgs(api, 'http://localhost/preview/table.csv', '108'),
      'table',
    );

    await expect(answer).rejects.toMatchObject({ status: 404 });
    expect(api.calls.map(({ path }) => path)).toEqual(['/api/indicators/108']);
  });

  it('serves the download at its own address, not redirecting to the slug', async () => {
    const api = createFakeApiClient({
      'GET /api/indicators/108': { ...detail, dataState: 'ready', unanswered: [] },
      'GET /api/indicators/108/data': {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: [],
      },
      'GET /api/indicators/108/areas': [],
    });

    const response = await loadIndicatorCsv(
      previewArgs(api, 'http://localhost/preview/table.csv', '108'),
      'table',
    );

    expect(response.status).toBe(200);
  });
});
