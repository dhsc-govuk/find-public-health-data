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
import { describe, expect, it } from 'vitest';
import { loadIndicator } from './loader.ts';
import { loadIndicatorPage } from './single-loader.ts';
import { indicatorDetail, observation, sex } from './view.testing.ts';

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
  it('returns the page metadata while observations and rankings are still pending', async () => {
    const client = api();
    const gate = Promise.withResolvers<void>();
    const delayed: FakeApiClient = {
      ...client,
      get: async (path, schema) => {
        if (path.includes('/data?') || path.includes('/ranking?')) await gate.promise;
        return client.get(path, schema);
      },
    };
    const page = await loadIndicatorPage(args(delayed));
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
    const page = await loadIndicatorPage(
      args(
        delayed,
        'http://localhost/indicator/indicator-108?compareWith=indicator-241&find=diabetes',
      ),
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
    const page = await loadIndicatorPage(
      args(client, 'http://localhost/indicator/indicator-108?compareWith=indicator-241'),
    );
    const failedData = expect(page.data).rejects.toMatchObject({ status: 502 });
    await expect(page.comparison).resolves.toMatchObject({
      compareAreaGroup: 'Local authorities',
      pair: expect.any(Object),
    });
    await failedData;
  });

  it('keeps comparisons available when the indicator search fails', async () => {
    const client = api({
      'GET /api/indicators': fails(new Response('Bad Gateway', { status: 502 })),
    });
    const page = await loadIndicatorPage(
      args(
        client,
        'http://localhost/indicator/indicator-108?compareWith=indicator-241&find=diabetes',
      ),
    );
    await Promise.all([
      expect(page.findResults).rejects.toMatchObject({ status: 502 }),
      expect(page.comparison).resolves.toMatchObject({
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
    const page = await loadIndicatorPage(
      args(
        delayed,
        'http://localhost/indicator/indicator-108?compareWith=indicator-241&find=diabetes',
      ),
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
    const page = await loadIndicatorPage(
      args(client, 'http://localhost/indicator/indicator-108?compareWith=indicator-241'),
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
    const page = await loadIndicatorPage(args(client));
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
      const page = await loadIndicatorPage(args(client));
      const comparison = await page.comparison;
      expect(comparison.areas.rows).toMatchObject([
        { areaCode: 'E92000001', value: null, label: '' },
        { areaCode: 'E06000052', value: 30, label: '' },
      ]);
      expect(comparison.areas.period).toBe('2024');
      await page.data;
    },
  );

  it('waits for complete content only when explicitly requested', async () => {
    const client = api();
    const page = await loadIndicatorPage(
      args(client, 'http://localhost/indicator/indicator-108?render=complete&find=diabetes'),
    );
    expect(page.complete).toBe(true);
    expect(page.data).not.toBeInstanceOf(Promise);
    expect(page.comparison).not.toBeInstanceOf(Promise);
    expect(page.findResults).toMatchObject([{ shortId: 241 }]);
  });

  it('keeps the comparison history and raw rankings out of page hydration', async () => {
    const client = api();
    const page = await loadIndicatorPage(
      args(client, 'http://localhost/indicator/indicator-108?compareWith=indicator-241'),
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
      args(client, 'http://localhost/indicator/indicator-108?compareWith=indicator-241&is=90366'),
    );
    expect(result.selected.map(({ detail }) => detail.shortId)).toEqual([108, 241]);
  });

  it('removes a comparison with the same indicator', async () => {
    const client = api();
    try {
      await loadIndicator(
        args(
          client,
          'http://localhost/indicator/indicator-108?compareWith=indicator-108&tab-indicator=compare',
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
      ['/api/indicators/indicator-241', 502],
    ] as const) {
      const client = api({ [`GET ${path}`]: fails(new Response(null, { status })) });
      await expect(
        loadIndicator(
          args(client, 'http://localhost/indicator/indicator-108?compareWith=indicator-241'),
        ),
      ).rejects.toMatchObject({ status });
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
          period: '2024-01-01|2024-12-31',
          fromDate: '2024-01-01',
          toDate: '2024-12-31',
          x: 10,
          y: 20,
        })),
      }),
      'GET /api/indicators/108/data': (call) => areaData(call, [observation(10)]),
      'GET /api/indicators/241/data': (call) => areaData(call, [observation(20)]),
    });
    const result = await loadIndicator(
      args(
        client,
        'http://localhost/indicator/indicator-108?compareWith=indicator-241&as=E06000052',
      ),
    );
    expect(result.scatter?.points).toHaveLength(26);
    expect(result.scatter?.points.find(({ code }) => code === 'E92000001')).toMatchObject({
      x: 10,
      y: 20,
    });
    expect(result.scatter?.points.some(({ code }) => code === 'E06000052')).toBe(false);
    expect(paths(client).filter((path) => path.includes('/ranking?'))).toHaveLength(2);
    const scatterPaths = paths(client).filter((path) => path.includes('/indicator-scatter?'));
    expect(scatterPaths).toHaveLength(0);
    expect(paths(client).filter((path) => path.startsWith('/api/indicator-data?'))).toHaveLength(0);
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
      args(
        client,
        'http://localhost/indicator/indicator-108?compareWith=indicator-241&as=E06000052',
      ),
    );
    expect(result.compareAreaGroup).toBe('');
    expect(result.scatter?.points).toMatchObject([
      { code: 'E06000052', x: 10, y: 20 },
      { code: 'E92000001', x: 10, y: 20 },
    ]);
  });

  it('keeps the server-selected common period separate from each latest ranking and honours saved axes', async () => {
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
          period: '2023-01-01|2023-12-31',
          fromDate: '2023-01-01',
          toDate: '2023-12-31',
          x: 20,
          y: 10,
        })),
      }),
    });
    const result = await loadIndicator(
      args(
        client,
        'http://localhost/indicator/indicator-108?compareWith=indicator-241&scatter-x=241&scatter-y=108',
      ),
    );
    expect(result.scatter?.points).toHaveLength(26);
    expect(result.compareAreasData[0]?.observations[0]?.fromDate).toBe('2024-01-01');
    expect(result.comparedAreasData[0]?.observations[0]?.fromDate).toBe('2023-01-01');
    expect(paths(client).find((path) => path.includes('/indicator-scatter?'))).toContain(
      '/indicator-scatter?indicator=241&indicator=108&',
    );
    expect(
      result.scatter?.points.every(
        ({ fromDate, x, y }) => fromDate === '2023-01-01' && x === 20 && y === 10,
      ),
    ).toBe(true);
  });
});
