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
import { indicatorDetail, observation } from './view.testing.ts';

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

  it('waits for complete content only when explicitly requested', async () => {
    const client = api();
    const page = await loadIndicatorPage(
      args(client, 'http://localhost/indicator/indicator-108?render=complete'),
    );
    expect(page.complete).toBe(true);
    expect(page.data).not.toBeInstanceOf(Promise);
    expect(page.comparison).not.toBeInstanceOf(Promise);
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
      expect(result.compareAreasData).toHaveLength(25);
      expect(result.compareAreaOptions).toHaveLength(25);
      expect(paths(client)).toContain(
        '/api/indicators/indicator-108/areas?displayGroup=Local%20authorities',
      );
      const rankingPaths = paths(client).filter((path) => path.includes('/108/ranking?'));
      expect(rankingPaths).toHaveLength(1);
      expect(areaCodes(rankingPaths[0] ?? '')).toHaveLength(25);
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

  it('pairs the full comparison geography group even when the indicator tab has a picked area', async () => {
    const client = api({
      'GET /api/indicator-data': (call) =>
        new URL(call.path, 'http://api').searchParams.getAll('indicator').map((id) => ({
          detail: indicatorDetail(Number(id)),
          areaData: rankings(call).map((area) => ({
            ...area,
            observations: [observation(id === '108' ? 10 : 20)],
          })),
        })),
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
    expect(paths(client).filter((path) => path.includes('/ranking?'))).toHaveLength(0);
    expect(paths(client).filter((path) => path.startsWith('/api/indicator-data?'))).toHaveLength(2);
    expect(paths(client).filter((path) => path === '/api/indicators/241')).toHaveLength(0);
    expect(
      paths(client).filter(
        (path) => path === '/api/indicators/indicator-108/areas?displayGroup=Local%20authorities',
      ),
    ).toHaveLength(1);
    expect(result.compareAreasData).toHaveLength(25);
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

  it('shares recent histories between rankings and scatter when indicators end in different years', async () => {
    const point = (year: number, value: number) => ({
      ...observation(value),
      fromDate: `${year}-01-01`,
      toDate: `${year}-12-31`,
    });
    const observations = (id: string) =>
      id === '108' ? [point(2023, 10), point(2024, 11)] : [point(2023, 20)];
    const client = api({
      'GET /api/indicator-data': (call) =>
        new URL(call.path, 'http://api').searchParams.getAll('indicator').map((id) => ({
          detail: indicatorDetail(Number(id)),
          areaData: rankings(call).map((area) => ({ ...area, observations: observations(id) })),
        })),
      'GET /api/indicators/108/data': (call) => areaData(call, observations('108')),
      'GET /api/indicators/241/data': (call) => areaData(call, observations('241')),
    });
    const result = await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?compareWith=indicator-241'),
    );
    expect(result.scatter?.points).toHaveLength(26);
    expect(result.compareAreasData[0]?.observations[0]?.fromDate).toBe('2024-01-01');
    expect(result.comparedAreasData[0]?.observations[0]?.fromDate).toBe('2023-01-01');
    expect(paths(client).some((path) => path.includes('/ranking?'))).toBe(false);
    expect(
      result.scatter?.points.every(
        ({ fromDate, x, y }) => fromDate === '2023-01-01' && x === 10 && y === 20,
      ),
    ).toBe(true);
  });
});
