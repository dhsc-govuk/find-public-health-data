import {
  indicatorPageDetailSchema,
  MAX_NEIGHBOUR_AREAS_PER_REQUEST,
} from '@fphd/public-api-features/contract';
import { rankingAreaSeries } from '@fphd/utils/observation-series';
import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiCall,
  type FakeApiClient,
  type FakeApiStubs,
  fails,
} from '@fphd/web-server/testing';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { benchmarkFixture } from './benchmark.testing.ts';
import { benchmarkCheckboxOptions } from './benchmarks.ts';
import { loadScatterComparison } from './charts/scatter-loader.ts';
import { publicIndicatorLinks } from './links.ts';
import { loadIndicator } from './loader.ts';
import { indicatorPageContext } from './page-context.ts';
import { loadIndicatorPage } from './single-loader.ts';

import { indicatorDetail, observation, sex } from './view.testing.ts';

/** The page with its data, for an indicator whose data the page shows. */
async function loadPage(...args: Parameters<typeof loadIndicatorPage>) {
  const page = await loadIndicatorPage(...args);
  if (page.dataPlaceholder !== null) throw new Error('Expected the page to load its data');
  return page;
}

const localAuthorities = [
  {
    displayGroup: 'Local authorities',
    areas: Array.from({ length: 25 }, (_, index) => ({
      code: `E${String(index).padStart(8, '0')}`,
      name: `Area ${index}`,
    })),
  },
];

function areaCodes(path: string) {
  return new URL(`http://localhost${path}`).searchParams.getAll('areaCode');
}

/**
 * The data of the areas a call asks for, with no observations. The API answers a query of one
 * area with that area alone, and of several with a list.
 */
function areaData(call: FakeApiCall, observations?: ReturnType<typeof observation>[]) {
  const areas = rankings(call).map((area) => ({
    ...area,
    observations: observations ?? area.observations,
  }));
  return areas.length === 1 ? (areas[0] ?? null) : areas;
}

/** The rankings of the areas a call asks for, with no observations: always a list. */
function rankings(call: FakeApiCall) {
  return areaCodes(call.path).map((code) => ({
    areaCode: code,
    areaName: code === 'E92000001' ? 'England' : `Area ${code}`,
    observations: [],
  }));
}

/** An indicator's detail, by slug or number, its areas, its data and its rankings. */
function indicatorStubs(shortId: number): FakeApiStubs {
  const slug = `indicator-${shortId}`;
  const detail = indicatorDetail(shortId);
  return {
    [`GET /api/indicators/${slug}`]: detail,
    [`GET /api/indicators/${shortId}`]: detail,
    [`GET /api/indicators/${slug}/areas`]: localAuthorities,
    [`GET /api/indicators/${shortId}/range`]: { periods: [] },
    [`GET /api/indicators/${shortId}/data`]: (call: FakeApiCall) => areaData(call),
    [`GET /api/indicators/${shortId}/ranking`]: rankings,
  };
}

/** Answers for indicators 108 and 241, the areas they cover, and `stubs`. */
function api(stubs: FakeApiStubs = {}) {
  return createFakeApiClient({
    ...indicatorStubs(108),
    ...indicatorStubs(241),
    'GET /api/indicator-scatter': { points: [] },
    'GET /api/indicator-data': (call) =>
      new URL(call.path, 'http://api').searchParams.getAll('indicator').map((id) => ({
        detail: indicatorDetail(Number(id)),
        areaData: rankings(call),
      })),
    'GET /api/indicators': {
      indicators: [{ shortId: 241, name: 'Diabetes prevalence', slug: 'indicator-241' }],
    },
    'GET /api/areas/display-groups': ['Local authorities', 'NHS regions'],
    'GET /api/areas/lookup': (call) =>
      areaCodes(call.path).map((code) => ({
        code,
        name: `Area ${code}`,
        areaType: 'UA unchanged',
        displayGroup: 'Local authorities',
      })),
    'GET /api/areas/parents': [],
    'GET /api/areas/neighbours': [],
    ...stubs,
  });
}

function paths(client: FakeApiClient) {
  return client.calls.map(({ path }) => path);
}

function args(
  client: FakeApiClient,
  url = 'http://localhost/indicator/indicator-108',
  slug: string | undefined = 'indicator-108',
): LoaderFunctionArgs {
  const context = new RouterContextProvider();
  context.set(apiContext, client);
  return {
    context,
    params: slug ? { slug } : {},
    request: new Request(url),
  } as unknown as LoaderFunctionArgs;
}

describe('loadIndicator', () => {
  it('keeps all benchmark choices on compare pages using the enriched area lookup', async () => {
    const fixture = benchmarkFixture();
    const client = api({
      'GET /api/indicators/indicator-108': fixture.detail,
      'GET /api/indicators/108/data': fixture.areaData,
      'GET /api/areas/lookup': fixture.lookup,
      'GET /api/areas/parents': Object.entries(fixture.geography.regionByCode).map(
        ([code, parent]) => ({
          code,
          parentCode: parent.code,
          parentName: parent.name,
        }),
      ),
    });
    const page = await loadPage(
      args(
        client,
        'http://localhost/indicator/indicator-108?tab-indicator=compare&compareWith=241&as=E08000003&as=E06000052',
      ),
    );
    const data = await page.data;
    expect(
      benchmarkCheckboxOptions(true, {
        areas: fixture.areaData.slice(0, 2),
        geography: data.benchmarkGeography,
        englandObservations: fixture.areaData[2]?.observations ?? [],
        goal: fixture.detail.goal,
      }).map(({ value }) => value),
    ).toEqual([
      'england',
      'region',
      'imd2025',
      'imd2019',
      'goal',
      'neighbours:E08000003',
      'neighbours:E06000052',
      'ca:E08000003',
      'ca:E06000052',
    ]);
    const requests = paths(client);
    expect(requests).toContain(
      '/api/areas/lookup?areaCode=E08000003&areaCode=E06000052&includeBenchmarks=true',
    );
    expect(requests.filter((path) => path.startsWith('/api/areas/parents?'))).toEqual([
      '/api/areas/parents?areaCode=E08000003&areaCode=E06000052&parentType=Regions%20(statistical)',
    ]);
    expect(requests.some((path) => /^\/api\/areas\/(deprivation|neighbours)\?/.test(path))).toBe(
      false,
    );
  });

  it.each([
    ['', false],
    ['tab-indicator=areas', true],
    ['render=complete', true],
  ])(
    'includes only highlighted neighbours in page loader data when needed: %s',
    async (query, detailed) => {
      const client = api({
        'GET /api/indicators/indicator-108/areas': [
          {
            displayGroup: 'Local authorities',
            areas: [
              { code: 'E06000001', name: 'Hartlepool' },
              { code: 'E06000047', name: 'County Durham' },
            ],
          },
        ],
        'GET /api/areas/neighbours': [{ code: 'E06000001', neighbours: ['E06000006'] }],
      });
      const page = await loadPage(
        args(client, `http://localhost/indicator/indicator-108?highlight=E06000001&${query}`),
      );
      const comparison = await page.comparison;
      expect(
        comparison.compareAreaOptions.map(({ code, neighbours }) => ({ code, neighbours })),
      ).toEqual([
        { code: 'E06000001', neighbours: detailed ? ['E06000006'] : undefined },
        { code: 'E06000047', neighbours: undefined },
      ]);
      expect(paths(client).filter((path) => path.startsWith('/api/areas/neighbours?'))).toEqual(
        detailed ? ['/api/areas/neighbours?areaCode=E06000001'] : [],
      );
    },
  );

  it('loads neighbours for every SSR highlight in capped requests', async () => {
    const areas = Array.from({ length: MAX_NEIGHBOUR_AREAS_PER_REQUEST + 1 }, (_, index) => ({
      code: `E06${String(index).padStart(6, '0')}`,
      name: `Area ${index}`,
    }));
    const client = api({
      'GET /api/indicators/indicator-108/areas': [{ displayGroup: 'Local authorities', areas }],
      'GET /api/areas/neighbours': (call) =>
        areaCodes(call.path)
          .slice(0, MAX_NEIGHBOUR_AREAS_PER_REQUEST)
          .map((code) => ({ code, neighbours: ['E06000006'] })),
    });
    const query = new URLSearchParams([
      ['tab-indicator', 'areas'],
      ...areas.map(({ code }) => ['highlight', code]),
    ]);
    const result = await loadIndicator(
      args(client, `http://localhost/indicator/indicator-108?${query}`),
    );
    expect(result.compareAreaOptions.every(({ neighbours }) => neighbours?.length === 1)).toBe(
      true,
    );
    const requested = paths(client)
      .filter((path) => path.startsWith('/api/areas/neighbours?'))
      .map(areaCodes);
    expect(requested.map((codes) => codes.length)).toEqual([MAX_NEIGHBOUR_AREAS_PER_REQUEST, 1]);
    expect(requested.flat()).toEqual(areas.map(({ code }) => code));
  });

  it('keeps SSR indicator data and comparisons available when neighbours fail', async () => {
    const client = api({
      'GET /api/areas/neighbours': fails(new Response('Bad Gateway', { status: 502 })),
    });
    const result = await loadIndicator(
      args(
        client,
        'http://localhost/indicator/indicator-108?tab-indicator=areas&highlight=E00000000&neighbours=E00000000',
      ),
    );
    expect(result.selected[0]?.detail.shortId).toBe(108);
    expect(result.compareAreasData).toHaveLength(26);
    expect(result.compareAreaOptions).toHaveLength(25);
    expect(result.compareAreaOptions.every(({ neighbours }) => neighbours === undefined)).toBe(
      true,
    );
  });

  it('defers observations and rankings on client navigations', async () => {
    const client = api();
    const gate = Promise.withResolvers<void>();
    const delayed: FakeApiClient = {
      ...client,
      get: async (path, schema) => {
        if (path.includes('/data?') || path.includes('/ranking?')) await gate.promise;
        return client.get(path, schema);
      },
    };
    const page = await loadPage(args(delayed, 'http://localhost/indicator/indicator-108.data'));
    try {
      expect(page.detail.shortId).toBe(108);
      expect(page.data).toBeInstanceOf(Promise);
      expect(page.comparison).toBeInstanceOf(Promise);
      expect(paths(client).some((path) => path.includes('/data?'))).toBe(false);
    } finally {
      gate.resolve();
    }
    const [data, comparison] = await Promise.all([page.data, page.comparison]);
    expect(data.selected[0]?.detail.shortId).toBe(108);
    expect(comparison.compareAreaOptions).toHaveLength(25);
  });

  it('settles comparisons while the primary history is still pending', async () => {
    const client = api();
    const history = Promise.withResolvers<void>();
    let dataReady = false;
    const delayed: FakeApiClient = {
      ...client,
      get: async (path, schema) => {
        if (path.includes('/data?')) await history.promise;
        return client.get(path, schema);
      },
    };
    const page = await loadPage(
      args(delayed, 'http://localhost/indicator/indicator-108.data?compareWith=241&find=diabetes'),
    );
    const data = Promise.resolve(page.data).then((data) => {
      dataReady = true;
      return data;
    });
    try {
      const comparison = await page.comparison;
      expect(comparison.compareAreaOptions).toHaveLength(25);
      expect(comparison.pair).toBeDefined();
      expect((await page.findResults)[0]?.shortId).toBe(241);
      expect(dataReady).toBe(false);
    } finally {
      history.resolve();
      await data;
    }
    expect(paths(client).some((path) => path.includes('/241/data?'))).toBe(false);
  });

  it('keeps comparisons available when the primary history fails', async () => {
    const client = api({
      'GET /api/indicators/108/data': fails(new Response('Bad Gateway', { status: 502 })),
    });
    const page = await loadPage(
      args(client, 'http://localhost/indicator/indicator-108?compareWith=241'),
    );
    const failedData = expect(page.data).rejects.toMatchObject({ status: 502 });
    await expect(Promise.resolve(page.comparison)).resolves.toMatchObject({
      compareAreaGroup: 'Local authorities',
      pair: expect.any(Object),
    });
    await failedData;
  });

  it('keeps comparisons available when the indicator search fails', async () => {
    const client = api({
      'GET /api/indicators': fails(new Response('Bad Gateway', { status: 502 })),
    });
    const page = await loadPage(
      args(client, 'http://localhost/indicator/indicator-108.data?compareWith=241&find=diabetes'),
    );
    await Promise.all([
      expect(page.findResults).rejects.toMatchObject({ status: 502 }),
      expect(Promise.resolve(page.comparison)).resolves.toMatchObject({
        compareAreaGroup: 'Local authorities',
        pair: expect.any(Object),
      }),
      page.data,
    ]);
  });

  it('settles comparisons while the indicator search is still pending', async () => {
    const client = api();
    const search = Promise.withResolvers<void>();
    let searchReady = false;
    const delayed: FakeApiClient = {
      ...client,
      get: async (path, schema) => {
        if (path.startsWith('/api/indicators?q=')) await search.promise;
        return client.get(path, schema);
      },
    };
    const page = await loadPage(
      args(delayed, 'http://localhost/indicator/indicator-108.data?compareWith=241&find=diabetes'),
    );
    const results = Promise.resolve(page.findResults).then(() => {
      searchReady = true;
    });
    try {
      const comparison = await Promise.race([
        page.comparison,
        new Promise((resolve) => setTimeout(() => resolve('search still pending'), 1000)),
      ]);
      expect(comparison).toMatchObject({ pair: expect.any(Object) });
      expect(searchReady).toBe(false);
    } finally {
      search.resolve();
      await Promise.all([results, page.data]);
    }
  });

  it('keeps England in comparisons when there is no supported comparison group', async () => {
    const client = api({
      'GET /api/indicators/indicator-108/areas': [{ displayGroup: 'Countries', areas: [] }],
      'GET /api/indicators/indicator-241/areas': [{ displayGroup: 'Countries', areas: [] }],
      'GET /api/indicator-data': [
        {
          detail: indicatorDetail(108),
          areaData: [
            { areaCode: 'E92000001', areaName: 'England', observations: [observation(10)] },
          ],
        },
        {
          detail: indicatorDetail(241),
          areaData: [
            { areaCode: 'E92000001', areaName: 'England', observations: [observation(20)] },
          ],
        },
      ],
    });
    const page = await loadPage(
      args(client, 'http://localhost/indicator/indicator-108?compareWith=241'),
    );
    const comparison = await page.comparison;
    expect(comparison.areas.rows).toMatchObject([{ areaCode: 'E92000001', value: 10 }]);
    expect(comparison.pair?.england).toMatchObject({ code: 'E92000001', values: [10, 20] });
    expect(comparison.areas.period).toBe('2024');
    expect(paths(client)).toContain(
      '/api/indicator-data?indicator=108&indicator=241&areaCode=E92000001',
    );
    expect(paths(client).some((path) => path.includes('/ranking?'))).toBe(false);
    await page.data;
  });

  it('preserves the latest England period when its value is missing and no comparison group exists', async () => {
    const latest = {
      ...observation(20),
      fromDate: '2025-01-01',
      toDate: '2025-12-31',
      value: null,
    };
    const client = api({
      'GET /api/indicators/indicator-108/areas': [{ displayGroup: 'Countries', areas: [] }],
      'GET /api/indicators/108/ranking': [
        { areaCode: 'E92000001', areaName: 'England', observations: [observation(10)] },
      ],
      'GET /api/indicator-data': [
        {
          detail: indicatorDetail(108),
          areaData: [{ areaCode: 'E92000001', areaName: 'England', observations: [latest] }],
        },
      ],
    });
    const page = await loadPage(args(client));
    const comparison = await page.comparison;
    expect(comparison.areas.rows).toMatchObject([{ areaCode: 'E92000001', value: null }]);
    expect(comparison.areas.period).toBe('2025');
    await page.data;
  });

  it.each([
    { ...observation(10, [sex('Female')]), fromDate: '2025-01-01', toDate: '2025-12-31' },
    observation(10, [sex('Male')]),
  ])(
    'keeps a missing England benchmark without substituting an unmatched point: %j',
    async (benchmark) => {
      const client = api({
        'GET /api/indicators/108/ranking': [
          {
            areaCode: 'E06000052',
            areaName: 'Cornwall',
            observations: [observation(30, [sex('Female')])],
          },
          { areaCode: 'E92000001', areaName: 'England', observations: [] },
        ],
        'GET /api/indicators/108/data': {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: [benchmark],
        },
      });
      const page = await loadPage(args(client));
      const comparison = await page.comparison;
      expect(comparison.areas.rows).toMatchObject([
        { areaCode: 'E92000001', value: null, label: '' },
        { areaCode: 'E06000052', value: 30, label: 'Not compared' },
      ]);
      expect(comparison.areas.period).toBe('2024');
      await page.data;
    },
  );

  it('settles every section for a document request without a rendering parameter', async () => {
    const client = api();
    const page = await loadPage(
      args(client, 'http://localhost/indicator/indicator-108?find=diabetes'),
    );
    expect(page.data).not.toBeInstanceOf(Promise);
    expect(page.comparison).not.toBeInstanceOf(Promise);
    expect(page.findResults).toMatchObject([{ shortId: 241 }]);
  });

  it('keeps the comparison history and raw rankings out of page hydration', async () => {
    const client = api();
    const page = await loadPage(
      args(client, 'http://localhost/indicator/indicator-108?compareWith=241'),
    );
    const [data, comparison] = await Promise.all([page.data, page.comparison]);
    expect(data.selected.map(({ detail }) => detail.shortId)).toEqual([108]);
    expect(data.selection.shortIds).toEqual([108]);
    expect(comparison.pair).toBeDefined();
    expect(comparison).not.toHaveProperty('compareAreasData');
    expect(comparison).not.toHaveProperty('comparedAreasData');
    expect(comparison).not.toHaveProperty('chartIndicators');
    expect(
      comparison.areaChart.areaData.every(({ observations }) => typeof observations === 'string'),
    ).toBe(true);
  });

  it.each(['/api/indicators?q=', '/api/indicator-data?'])(
    'waits for final document data from %s without blocking navigation data',
    async (pathPrefix) => {
      const client = api({
        'GET /api/indicators/indicator-108/areas': [{ displayGroup: 'Countries', areas: [] }],
        'GET /api/indicator-data': [{ detail: indicatorDetail(108), areaData: [] }],
      });
      const gate = Promise.withResolvers<void>();
      const started = Promise.withResolvers<void>();
      const delayed: FakeApiClient = {
        ...client,
        get: async (path, schema) => {
          if (path.startsWith(pathPrefix)) {
            started.resolve();
            await gate.promise;
          }
          return client.get(path, schema);
        },
      };
      const ready = vi.fn();
      const pending = loadPage(
        args(delayed, 'http://localhost/indicator/indicator-108?find=diabetes'),
      ).then(ready);
      try {
        await started.promise;
        expect(ready).not.toHaveBeenCalled();
        const navigation = await loadPage(
          args(delayed, 'http://localhost/indicator/indicator-108.data?find=diabetes'),
        );
        expect(navigation.findResults).toBeInstanceOf(Promise);
        expect(navigation.comparison).toBeInstanceOf(Promise);
        gate.resolve();
        await Promise.all([navigation.data, navigation.comparison, navigation.findResults]);
      } finally {
        gate.resolve();
        await pending;
      }
      expect(ready).toHaveBeenCalledOnce();
    },
  );

  it('waits for slow document sections beyond the rendering deadline', async () => {
    vi.useFakeTimers();
    const client = api();
    const delayed: FakeApiClient = {
      ...client,
      get: async (path, schema) => {
        if (path.includes('/data?') || path.includes('/ranking?'))
          await new Promise((resolve) => setTimeout(resolve, 7_000));
        return client.get(path, schema);
      },
    };
    const ready = vi.fn();
    try {
      const pending = loadPage(args(delayed)).then(ready);
      await vi.advanceTimersByTimeAsync(6_000);
      expect(ready).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      await pending;
      expect(ready).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires one route indicator before any API request', async () => {
    const client = api();
    await expect(
      loadIndicator(args(client, 'http://localhost/indicator', '')),
    ).rejects.toMatchObject({ status: 404 });
    expect(client.calls).toEqual([]);
  });

  it('loads the route indicator and England data', async () => {
    const client = api();
    const result = await loadIndicator(args(client));
    expect(result.selected.map(({ detail }) => detail.shortId)).toEqual([108]);
    expect(paths(client)).toContain('/api/indicators/indicator-108');
    expect(paths(client)).toContain('/api/indicators/108/data?areaCode=E92000001');
  });

  it('ignores obsolete multi-indicator selections in the page URL', async () => {
    const client = api();
    const result = await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?is=241&is=90366'),
    );
    expect(result.selected.map(({ detail }) => detail.shortId)).toEqual([108]);
    expect(paths(client)).not.toContain('/api/indicators/241');
  });

  it('compares the route indicator with exactly one other indicator', async () => {
    const client = api();
    const result = await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?compareWith=241&is=90366'),
    );
    expect(result.selected.map(({ detail }) => detail.shortId)).toEqual([108, 241]);
  });

  it('redirects a comparison named by its slug to its short id', async () => {
    const client = api();

    await expect(
      loadIndicator(
        args(
          client,
          'http://localhost/indicator/indicator-108?tab-indicator=compare&compareWith=indicator-241',
        ),
      ),
    ).rejects.toSatisfy(
      (response: Response) =>
        response.status === 302 &&
        response.headers.get('Location') ===
          '/indicator/indicator-108?tab-indicator=compare&compareWith=241',
    );
  });

  it('removes a comparison with the same indicator', async () => {
    const client = api();
    try {
      await loadIndicator(
        args(
          client,
          'http://localhost/indicator/indicator-108?compareWith=108&tab-indicator=compare',
        ),
      );
      throw new Error('Expected redirect');
    } catch (response) {
      expect((response as Response).status).toBe(302);
      expect((response as Response).headers.get('Location')).toBe(
        '/indicator/indicator-108?tab-indicator=compare',
      );
    }
  });

  it('rejects a malformed comparison segment before requesting it', async () => {
    const client = api();
    await expect(
      loadIndicator(
        args(client, 'http://localhost/indicator/indicator-108?compareWith=..%2Ftopics'),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(paths(client).some((path) => path.includes('topics'))).toBe(false);
  });

  it('removes an unpublished comparison while preserving the primary view', async () => {
    const client = api({
      'GET /api/indicators/missing': () => fails(new Response(null, { status: 404 })),
    });
    await expect(
      loadIndicator(
        args(
          client,
          'http://localhost/indicator/indicator-108?compareWith=missing&tab-indicator=compare&as=E06000052',
        ),
      ),
    ).rejects.toMatchObject({ status: 302, headers: expect.any(Headers) });
    try {
      await loadIndicator(
        args(
          client,
          'http://localhost/indicator/indicator-108?compareWith=missing&tab-indicator=compare&as=E06000052',
        ),
      );
    } catch (response) {
      expect((response as Response).headers.get('Location')).toBe(
        '/indicator/indicator-108?tab-indicator=compare&as=E06000052',
      );
    }
  });

  it('propagates primary not-found and comparison API failures', async () => {
    for (const [path, status] of [
      ['/api/indicators/indicator-108', 404],
      ['/api/indicators/241', 502],
    ] as const) {
      const client = api({ [`GET ${path}`]: fails(new Response(null, { status })) });
      await expect(
        loadIndicator(args(client, 'http://localhost/indicator/indicator-108?compareWith=241')),
      ).rejects.toMatchObject({ status });
    }
  });

  it('asks once for the local authorities the comparison and the geography picker share', async () => {
    for (const load of [loadIndicator, loadIndicatorPage]) {
      const client = api();
      const page = await load(args(client));
      await Promise.all(Object.values(page));
      const requests = paths(client).filter(
        (path) => path === '/api/indicators/indicator-108/areas?displayGroup=Local%20authorities',
      );
      expect(requests).toHaveLength(1);
    }
  });

  it('fetches complete non-authority groups before applying the selection limit', async () => {
    const client = api();
    await loadIndicator(args(client, 'http://localhost/indicator/indicator-108?als=NHS+regions'));
    expect(paths(client)).toContain(
      '/api/indicators/indicator-108/areas?displayGroup=NHS%20regions',
    );
  });

  it('redirects numeric public addresses to the canonical slug', async () => {
    const client = api();
    try {
      await loadIndicator(args(client, 'http://localhost/indicator/108?as=E06000052', '108'));
      throw new Error('Expected redirect');
    } catch (response) {
      expect((response as Response).status).toBe(301);
      expect((response as Response).headers.get('Location')).toBe(
        '/indicator/indicator-108?as=E06000052',
      );
    }
  });

  it('returns server matches for a no-script comparison search', async () => {
    const client = api();
    const result = await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?find=+diabetes+'),
    );
    expect(paths(client)).toContain('/api/indicators?q=diabetes&limit=20');
    expect(result.findResults).toEqual([
      { shortId: 241, name: 'Diabetes prevalence', slug: 'indicator-241' },
    ]);
  });

  it('caps individual areas and keeps England as a benchmark', async () => {
    const client = api();
    const codes = Array.from({ length: 21 }, (_, index) => `E${String(index).padStart(8, '0')}`);
    const query = new URLSearchParams(codes.map((code) => ['as', code]));
    const result = await loadIndicator(
      args(client, `http://localhost/indicator/indicator-108?${query}`),
    );
    expect(result.selection.areaCodes).toEqual(codes.slice(0, 19));
    expect(result.areasLimited).toBe(true);
    const path =
      paths(client).find(
        (candidate) => candidate.includes('/108/data?') && candidate.includes('E92000001'),
      ) ?? '';
    expect(areaCodes(path)).toEqual([...codes.slice(0, 19), 'E92000001']);
  });

  it("loads the spread of the picked areas' level with an England benchmark", async () => {
    const range = { periods: [] };
    const client = api({ 'GET /api/indicators/108/range': range });
    const result = await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?as=E00000001&cmp-108=england'),
    );

    expect(paths(client)).toContain('/api/indicators/108/range?displayGroup=Local%20authorities');
    expect(result.selected[0]?.ranges).toEqual({ 'Local authorities': [] });
  });

  it.each(['', '&cmp-108=', '&cmp-108=none'])(
    'loads no spread without a benchmark: %s',
    async (query) => {
      const client = api();
      await loadIndicator(
        args(client, `http://localhost/indicator/indicator-108?as=E00000001${query}`),
      );

      expect(paths(client).some((path) => path.includes('/range'))).toBe(false);
    },
  );

  it.each(['cmp-108=region&cmp-108=england&cmp-108=region', 'cmp-compare=region&cmp-108=england'])(
    'loads both benchmark distributions once: %s',
    async (query) => {
      const client = api({
        'GET /api/areas/parents': [
          { code: 'E00000001', parentCode: 'E12000008', parentName: 'South East' },
        ],
      });
      const result = await loadIndicator(
        args(client, `http://localhost/indicator/indicator-108?as=E00000001&${query}`),
      );
      expect(paths(client).filter((path) => path.includes('/108/range?'))).toEqual([
        ...(query.startsWith('cmp-compare')
          ? [
              '/api/indicators/108/range?displayGroup=Statistical%20regions',
              '/api/indicators/108/range?displayGroup=Local%20authorities',
            ]
          : [
              '/api/indicators/108/range?displayGroup=Local%20authorities',
              '/api/indicators/108/range?displayGroup=Statistical%20regions',
            ]),
      ]);
      expect(result.selected[0]?.regionData?.map(({ areaCode }) => areaCode)).toEqual([
        'E12000008',
      ]);
    },
  );

  it('loads each region and display level once across picked areas', async () => {
    const client = api({
      'GET /api/areas/lookup': (call) =>
        areaCodes(call.path).map((code) => ({
          code,
          name: code,
          areaType: 'Council',
          displayGroup:
            code === 'E07000223' ? 'Lower-tier local authorities' : 'Upper-tier local authorities',
        })),
      'GET /api/areas/parents': ['E10000032', 'E10000011', 'E07000223'].map((code) => ({
        code,
        parentCode: 'E12000008',
        parentName: 'South East',
      })),
    });
    const result = await loadIndicator(
      args(
        client,
        'http://localhost/indicator/indicator-108?as=E10000032&as=E10000011&as=E07000223&cmp-108=region',
      ),
    );
    expect(paths(client).filter((path) => path.includes('/108/range?'))).toEqual([
      '/api/indicators/108/range?tier=upper&parent=E12000008',
      '/api/indicators/108/range?tier=lower&parent=E12000008',
    ]);
    expect(result.selected[0]?.ranges).toEqual({
      'region:E12000008:upper': [],
      'region:E12000008:lower': [],
    });
  });

  it('loads every section and requests compact rankings for all comparison areas', async () => {
    for (const query of ['', '?tab-indicator=areas']) {
      const client = api();
      const result = await loadIndicator(
        args(client, `http://localhost/indicator/indicator-108${query}`),
      );
      expect(result.compareAreasData).toHaveLength(26);
      expect(result.compareAreaOptions).toHaveLength(25);
      expect(paths(client)).toContain(
        '/api/indicators/indicator-108/areas?displayGroup=Local%20authorities',
      );
      const rankingPaths = paths(client).filter((path) => path.includes('/108/ranking?'));
      expect(rankingPaths).toHaveLength(1);
      expect(areaCodes(rankingPaths[0] ?? '')).toEqual([
        ...(localAuthorities[0]?.areas.map(({ code }) => code) ?? []),
        'E92000001',
      ]);
      const histories = paths(client).filter((path) => path.includes('/108/data?'));
      expect(histories).toHaveLength(1);
    }
  });

  it('loads quintile distributions for picked levels and the current comparison group only when needed', async () => {
    let client = api();
    await loadIndicator(args(client));
    expect(paths(client).some((path) => path.includes('/range?'))).toBe(false);

    client = api();
    await loadIndicator(args(client, 'http://localhost/indicator/indicator-108?quintile-108=yes'));
    expect(paths(client).filter((path) => path.includes('/range?'))).toEqual([
      '/api/indicators/108/range?displayGroup=Local%20authorities',
    ]);

    client = api();
    await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?quintile-108=yes&as=E06000052'),
    );
    expect(paths(client).filter((path) => path.includes('/range?'))).toHaveLength(1);
  });

  it('pairs the full comparison geography group without paging histories when an area is picked', async () => {
    const client = api({
      'GET /api/indicators/108/ranking': (call) =>
        rankings(call).map((area) => ({ ...area, observations: [observation(10)] })),
      'GET /api/indicators/241/ranking': (call) =>
        rankings(call).map((area) => ({ ...area, observations: [observation(20)] })),
      'GET /api/indicator-scatter': (call) => ({
        points: rankings(call).map((area) => ({
          code: area.areaCode,
          name: area.areaName,
          xPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
          yPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
          x: 10,
          y: 20,
        })),
        rankings: [10, 20].map((value) =>
          rankings(call).map((area) => ({ ...area, observations: [observation(value)] })),
        ),
      }),
      'GET /api/indicators/108/data': (call) => areaData(call, [observation(10)]),
      'GET /api/indicators/241/data': (call) => areaData(call, [observation(20)]),
    });
    const result = await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?compareWith=241&as=E06000052'),
    );
    expect(result.scatter?.points).toHaveLength(26);
    expect(result.scatter?.points.find(({ code }) => code === 'E92000001')).toMatchObject({
      x: 10,
      y: 20,
    });
    expect(result.scatter?.points.some(({ code }) => code === 'E06000052')).toBe(false);
    expect(paths(client).filter((path) => path.includes('/ranking?'))).toHaveLength(0);
    const scatterPaths = paths(client).filter((path) => path.includes('/indicator-scatter?'));
    expect(scatterPaths).toHaveLength(1);
    expect(paths(client).filter((path) => path.startsWith('/api/indicator-data?'))).toEqual([]);
    expect(result.compareAreasData).toHaveLength(26);
    expect(result.compareAreasData[0]?.observations).toHaveLength(1);
  });

  it('preserves picked-area histories when the pair has no supported comparison geography', async () => {
    const client = api({
      'GET /api/indicators/indicator-108/areas': [],
      'GET /api/indicators/indicator-241/areas': [],
      'GET /api/indicators/108/data': (call) => areaData(call, [observation(10)]),
      'GET /api/indicators/241/data': (call) => areaData(call, [observation(20)]),
    });
    const result = await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?compareWith=241&as=E06000052'),
    );
    expect(result.compareAreaGroup).toBe('');
    expect(result.scatter?.points).toMatchObject([
      { code: 'E06000052', x: 10, y: 20 },
      { code: 'E92000001', x: 10, y: 20 },
    ]);
  });

  it('pairs each latest ranking period and honours saved axes', async () => {
    const point = (year: number, value: number) => ({
      ...observation(value),
      fromDate: `${year}-01-01`,
      toDate: `${year}-12-31`,
    });
    const client = api({
      'GET /api/indicators/108/ranking': (call) =>
        rankings(call).map((area) => ({ ...area, observations: [point(2024, 11)] })),
      'GET /api/indicators/241/ranking': (call) =>
        rankings(call).map((area) => ({ ...area, observations: [point(2023, 20)] })),
      'GET /api/indicator-scatter': (call) => ({
        points: rankings(call).map((area) => ({
          code: area.areaCode,
          name: area.areaName,
          xPeriod: { fromDate: '2023-01-01', toDate: '2023-12-31' },
          yPeriod: { fromDate: '2024-01-01', toDate: '2024-12-31' },
          x: 20,
          y: 11,
        })),
        rankings: [
          rankings(call).map((area) => ({ ...area, observations: [point(2023, 20)] })),
          rankings(call).map((area) => ({ ...area, observations: [point(2024, 11)] })),
        ],
      }),
    });
    const result = await loadIndicator(
      args(
        client,
        'http://localhost/indicator/indicator-108?compareWith=241&scatter-x=241&scatter-y=108',
      ),
    );
    expect(result.scatter?.points).toHaveLength(26);
    expect(result.compareAreasData[0]?.observations[0]?.fromDate).toBe('2024-01-01');
    expect(result.comparedAreasData[0]?.observations[0]?.fromDate).toBe('2023-01-01');
    expect(paths(client).filter((path) => path.includes('/indicator-scatter?'))).toHaveLength(1);
    expect(
      result.scatter?.points.every(
        ({ xPeriod, yPeriod, x, y }) =>
          xPeriod.fromDate === '2023-01-01' &&
          yPeriod.fromDate === '2024-01-01' &&
          x === 20 &&
          y === 11,
      ),
    ).toBe(true);
  });

  it('falls back to canonical scatter pairing when the scatter endpoint returns 404', async () => {
    const primary = [observation(0, [sex('Female')])];
    const secondary = [observation(20, [sex('Female')])];
    const client = api({
      'GET /api/indicators/108/ranking': (call) =>
        rankings(call).map((area) => ({ ...area, observations: primary })),
      'GET /api/indicators/241/ranking': (call) =>
        rankings(call).map((area) => ({ ...area, observations: secondary })),
      'GET /api/indicator-scatter': () => fails(new Response(null, { status: 404 })),
    });
    const result = await loadIndicator(
      args(
        client,
        'http://localhost/indicator/indicator-108?compareWith=241&scatter-x=241&scatter-y=108',
      ),
    );
    const expected = loadScatterComparison(
      [
        { detail: indicatorDetail(108), areaData: result.compareAreasData },
        { detail: indicatorDetail(241), areaData: result.comparedAreasData },
      ],
      new URLSearchParams('scatter-x=241&scatter-y=108'),
    );
    expect(expected?.points).toHaveLength(26);
    expect(result.scatter).toEqual(expected);
    expect(result.scatter?.points[0]).toMatchObject({ x: 20, y: 0 });
    expect(paths(client).filter((path) => path.startsWith('/api/indicator-scatter?'))).toHaveLength(
      1,
    );
  });

  it.each(['Age', 'Ethnicity'])(
    'returns canonical earlier points when latest rankings select different %s segments',
    async (type) => {
      const point = (year: number, value: number, segment: string) => ({
        ...observation(value, [{ type, value: segment, dimensionClass: 'core', sortOrder: 1 }]),
        fromDate: `${year}-01-01`,
        toDate: `${year}-12-31`,
      });
      const selected = [108, 241].map((shortId, index) => ({
        detail: indicatorDetail(shortId),
        areaData: [
          {
            areaCode: 'E00000000',
            areaName: 'Area 0',
            observations: index
              ? [point(2023, 20, 'First'), point(2024, 21, 'First')]
              : [point(2023, 0, 'First')],
          },
          { areaCode: 'E00000001', areaName: 'Area 1', observations: [point(2024, 30, 'Second')] },
        ],
      }));
      const params = new URLSearchParams('scatter-x=241&scatter-y=108');
      const expected = loadScatterComparison(selected, params);
      if (!expected) throw new Error('Expected a comparison pair');
      expect(expected.points).toMatchObject([
        {
          code: 'E00000000',
          x: 21,
          y: 0,
          xPeriod: { fromDate: '2024-01-01' },
          yPeriod: { fromDate: '2023-01-01' },
        },
      ]);
      const client = api({
        ...Object.fromEntries(
          selected.map(({ detail, areaData }) => [
            `GET /api/indicators/${detail.shortId}/ranking`,
            rankingAreaSeries(areaData),
          ]),
        ),
        'GET /api/indicator-scatter': expected,
      });
      const result = await loadIndicator(
        args(client, `http://localhost/indicator/indicator-108?compareWith=241&${params}`),
      );
      expect(result.scatter).toEqual(expected);
      expect(
        paths(client).filter((path) => path.startsWith('/api/indicator-scatter?')),
      ).toHaveLength(1);
    },
  );

  it('propagates scatter endpoint failures other than 404', async () => {
    const client = api({
      'GET /api/indicator-scatter': () => fails(new Response(null, { status: 502 })),
    });
    await expect(
      loadIndicator(args(client, 'http://localhost/indicator/indicator-108?compareWith=241')),
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe('loadIndicatorPage with no data to show', () => {
  const draft = { ...indicatorDetail(108), dataState: 'no-upload' as const, unanswered: [] };

  function previewArgs(client: FakeApiClient, query: string) {
    const loaderArgs = args(client, `http://localhost/indicator/indicator-108${query}`);
    loaderArgs.context.set(indicatorPageContext, {
      detailSchema: indicatorPageDetailSchema,
      links: publicIndicatorLinks,
    });
    return loaderArgs;
  }

  it('checks the address of a draft whose page reads a placeholder, then asks for no data', async () => {
    const client = api({ 'GET /api/indicators/indicator-108': draft });

    const page = await loadIndicatorPage(previewArgs(client, '?compareWith=241'));

    expect(page).toEqual({ detail: draft, dataPlaceholder: '[Not provided yet]' });
    expect(paths(client)).toEqual(['/api/indicators/indicator-108', '/api/indicators/241']);
  });

  it('answers a malformed comparison on a placeholder page as not found, as with data', async () => {
    const client = api({ 'GET /api/indicators/indicator-108': draft });

    await expect(
      loadIndicatorPage(previewArgs(client, '?compareWith=not%20an%20indicator')),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('redirects a comparison with itself on a placeholder page, as with data', async () => {
    const client = api({
      'GET /api/indicators/indicator-108': draft,
      'GET /api/indicators/108': draft,
    });

    await expect(loadIndicatorPage(previewArgs(client, '?compareWith=108'))).rejects.toMatchObject({
      status: 302,
      headers: expect.any(Headers),
    });
  });

  it('stays at a page shown at one address whatever the slug, as the preview is', async () => {
    const client = api({ 'GET /api/indicators/108': draft });
    const loaderArgs = args(client, 'http://localhost/preview', '108');
    loaderArgs.context.set(indicatorPageContext, {
      detailSchema: indicatorPageDetailSchema,
      links: { ...publicIndicatorLinks, page: () => '/preview' },
    });

    expect((await loadIndicatorPage(loaderArgs)).detail.slug).toBe('indicator-108');
  });

  it('loads the data of the public page, whose schema drops any data state', async () => {
    const client = api({ 'GET /api/indicators/indicator-108': draft });

    const page = await loadIndicatorPage(args(client));

    expect(page.dataPlaceholder).toBeNull();
    expect(page.detail).not.toHaveProperty('dataState');
    expect(paths(client).length).toBeGreaterThan(1);
  });
});

describe('loadIndicator for an indicator with no England value', () => {
  const regions = {
    displayGroup: 'Statistical regions',
    areas: [
      { code: 'E12000001', name: 'North East' },
      { code: 'E12000002', name: 'North West' },
    ],
  };
  const areasWithRegions = (call: FakeApiCall) =>
    new URL(call.path, 'http://api').searchParams.get('displayGroup') === 'Statistical regions'
      ? [regions]
      : [...localAuthorities, regions];

  it.each([{ observations: [] }, { observations: [{ ...observation(), value: null }] }])(
    'opens on statistical regions when England has no values in %j and nothing is chosen',
    async ({ observations }) => {
      const client = api({
        'GET /api/indicators/indicator-108/areas': areasWithRegions,
        'GET /api/indicators/108/data': (call: FakeApiCall) => areaData(call, observations),
      });

      const result = await loadIndicator(args(client));

      expect(result.defaultAreaLevel).toBe('Statistical regions');
      expect(result.selection).toMatchObject({ areaCodes: [], areaLevels: [] });
      expect(result.selected[0]?.areaData.map(({ areaCode }) => areaCode)).toEqual([
        'E12000001',
        'E12000002',
        'E92000001',
      ]);
    },
  );

  it('keeps England when the indicator has no region data', async () => {
    const client = api();

    const result = await loadIndicator(args(client));

    expect(result.defaultAreaLevel).toBeUndefined();
    expect(result.selected[0]?.areaData.map(({ areaCode }) => areaCode)).toEqual(['E92000001']);
  });

  it('shows the chosen areas rather than the regions', async () => {
    const client = api({ 'GET /api/indicators/indicator-108/areas': areasWithRegions });

    const result = await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?as=E00000001'),
    );

    expect(result.defaultAreaLevel).toBeUndefined();
    expect(result.selected[0]?.areaData.map(({ areaCode }) => areaCode)).toEqual([
      'E00000001',
      'E92000001',
    ]);
  });

  it('opens on England, asking for its data once, when England has a value', async () => {
    const client = api({
      'GET /api/indicators/indicator-108/areas': areasWithRegions,
      'GET /api/indicators/108/data': (call: FakeApiCall) => areaData(call, [observation()]),
    });

    const result = await loadIndicator(args(client));

    expect(result.defaultAreaLevel).toBeUndefined();
    expect(result.selected[0]?.areaData.map(({ areaCode }) => areaCode)).toEqual(['E92000001']);
    expect(
      paths(client).filter((path) => path === '/api/indicators/108/data?areaCode=E92000001'),
    ).toHaveLength(1);
  });
});
