import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { loadIndicator } from './loader.ts';
import { loadIndicatorPage } from './single-loader.ts';
import { observation } from './view.testing.ts';

function api() {
  const get = vi.fn(async (path: string): Promise<unknown> => {
    if (path.startsWith('/api/indicator-data?')) {
      const params = new URL(`http://localhost${path}`).searchParams;
      return params.getAll('indicator').map((id) => ({
        detail: { shortId: Number(id) },
        areaData: params.getAll('areaCode').map((code) => ({
          areaCode: code,
          areaName: `Area ${code}`,
          observations: [],
        })),
      }));
    }
    if (/\/api\/indicators\/[^/]+\/areas\?/.test(path))
      return [
        {
          displayGroup: 'Local authorities',
          areas: Array.from({ length: 25 }, (_, index) => ({
            code: `E${String(index).padStart(8, '0')}`,
            name: `Area ${index}`,
          })),
        },
      ];
    if (path.startsWith('/api/indicators?q='))
      return { indicators: [{ shortId: 241, name: 'Diabetes prevalence', slug: 'indicator-241' }] };
    if (path === '/api/areas/display-groups') return ['Local authorities', 'NHS regions'];
    if (path.startsWith('/api/areas/lookup'))
      return new URL(`http://localhost${path}`).searchParams.getAll('areaCode').map((code) => ({
        code,
        name: `Area ${code}`,
        areaType: 'UA unchanged',
        displayGroup: 'Local authorities',
      }));
    if (path.startsWith('/api/areas/parents')) return [];
    if (path.startsWith('/api/areas?displayGroup='))
      return [
        {
          displayGroup: 'Local authorities',
          areas: Array.from({ length: 25 }, (_, index) => ({
            code: `E${String(index).padStart(8, '0')}`,
            name: `Area ${index}`,
          })),
        },
      ];
    if (path.startsWith('/api/areas')) return [{ areaType: 'England', areas: [] }];
    if (path.includes('/data?') || path.includes('/ranking?'))
      return new URL(`http://localhost${path}`).searchParams.getAll('areaCode').map((code) => ({
        areaCode: code,
        areaName: code === 'E92000001' ? 'England' : `Area ${code}`,
        observations: [],
      }));
    if (path.includes('/range?')) return { periods: [] };
    const shortId = Number((path.split('/')[3] ?? '').replace('indicator-', ''));
    return { shortId, slug: `indicator-${shortId}`, areaTypes: [] };
  });
  return { client: { get } as unknown as ApiClient, get };
}

function args(
  client: ApiClient,
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
    const { client, get } = api();
    const gate = Promise.withResolvers<void>();
    const read = client.get;
    const delayed = {
      ...client,
      get: vi.fn(async (path, schema) => {
        if (path.includes('/data?') || path.includes('/ranking?')) await gate.promise;
        return read(path, schema);
      }),
    } as ApiClient;
    const page = await loadIndicatorPage(args(delayed));
    try {
      expect(page.detail.shortId).toBe(108);
      expect(page.data).toBeInstanceOf(Promise);
      expect(page.comparison).toBeInstanceOf(Promise);
      expect(get.mock.calls.some(([path]) => path.includes('/data?'))).toBe(false);
    } finally {
      gate.resolve();
    }
    const [data, comparison] = await Promise.all([page.data, page.comparison]);
    expect(data.selected[0]?.detail.shortId).toBe(108);
    expect(comparison.compareAreaOptions).toHaveLength(25);
  });

  it('waits for complete content only when explicitly requested', async () => {
    const { client } = api();
    const page = await loadIndicatorPage(
      args(client, 'http://localhost/indicator/indicator-108?render=complete'),
    );
    expect(page.complete).toBe(true);
    expect(page.data).not.toBeInstanceOf(Promise);
    expect(page.comparison).not.toBeInstanceOf(Promise);
  });

  it('requires one route indicator before any API request', async () => {
    const { client, get } = api();
    await expect(
      loadIndicator(args(client, 'http://localhost/indicator', '')),
    ).rejects.toMatchObject({ status: 404 });
    expect(get).not.toHaveBeenCalled();
  });

  it('loads the route indicator and England data', async () => {
    const { client, get } = api();
    const result = await loadIndicator(args(client));
    expect(result.selected.map(({ detail }) => detail.shortId)).toEqual([108]);
    expect(get).toHaveBeenCalledWith('/api/indicators/indicator-108', expect.anything());
    expect(get).toHaveBeenCalledWith(
      '/api/indicators/108/data?areaCode=E92000001',
      expect.anything(),
    );
  });

  it('ignores obsolete multi-indicator selections in the page URL', async () => {
    const { client, get } = api();
    const result = await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?is=241&is=90366'),
    );
    expect(result.selected.map(({ detail }) => detail.shortId)).toEqual([108]);
    expect(get.mock.calls.some(([path]) => path === '/api/indicators/241')).toBe(false);
  });

  it('compares the route indicator with exactly one other indicator', async () => {
    const { client } = api();
    const result = await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?compareWith=indicator-241&is=90366'),
    );
    expect(result.selected.map(({ detail }) => detail.shortId)).toEqual([108, 241]);
  });

  it('removes a comparison with the same indicator', async () => {
    const { client } = api();
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
    const { client, get } = api();
    await expect(
      loadIndicator(
        args(client, 'http://localhost/indicator/indicator-108?compareWith=..%2Ftopics'),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(get.mock.calls.some(([path]) => String(path).includes('topics'))).toBe(false);
  });

  it('removes an unpublished comparison while preserving the primary view', async () => {
    const { client, get } = api();
    const original = get.getMockImplementation();
    if (!original) throw new Error('Missing test API implementation');
    get.mockImplementation(async (path) => {
      if (path === '/api/indicators/missing') throw new Response(null, { status: 404 });
      return original(path);
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
      const { client, get } = api();
      const original = get.getMockImplementation();
      if (!original) throw new Error('Missing test API implementation');
      get.mockImplementation(async (candidate) => {
        if (candidate === path) throw new Response(null, { status });
        return original(candidate);
      });
      await expect(
        loadIndicator(
          args(client, 'http://localhost/indicator/indicator-108?compareWith=indicator-241'),
        ),
      ).rejects.toMatchObject({ status });
    }
  });

  it('fetches complete non-authority groups before applying the selection limit', async () => {
    const { client, get } = api();
    await loadIndicator(args(client, 'http://localhost/indicator/indicator-108?als=NHS+regions'));
    expect(get).toHaveBeenCalledWith(
      '/api/indicators/indicator-108/areas?displayGroup=NHS%20regions',
      expect.anything(),
    );
  });

  it('redirects numeric public addresses to the canonical slug', async () => {
    const { client } = api();
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
    const { client, get } = api();
    const result = await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?find=+diabetes+'),
    );
    expect(get).toHaveBeenCalledWith('/api/indicators?q=diabetes&limit=20', expect.anything());
    expect(result.findResults).toEqual([
      { shortId: 241, name: 'Diabetes prevalence', slug: 'indicator-241' },
    ]);
  });

  it('caps individual areas and keeps England as a benchmark', async () => {
    const { client, get } = api();
    const codes = Array.from({ length: 21 }, (_, index) => `E${String(index).padStart(8, '0')}`);
    const query = new URLSearchParams(codes.map((code) => ['as', code]));
    const result = await loadIndicator(
      args(client, `http://localhost/indicator/indicator-108?${query}`),
    );
    expect(result.selection.areaCodes).toEqual(codes.slice(0, 19));
    expect(result.areasLimited).toBe(true);
    const [path] =
      get.mock.calls.find(
        ([candidate]) =>
          String(candidate).includes('/108/data?') && String(candidate).includes('E92000001'),
      ) ?? [];
    expect(new URL(`http://localhost${path}`).searchParams.getAll('areaCode')).toEqual([
      ...codes.slice(0, 19),
      'E92000001',
    ]);
  });

  it('loads every section and requests compact rankings for all comparison areas', async () => {
    const { client, get } = api();
    for (const query of ['', '?tab-indicator=areas']) {
      get.mockClear();
      const result = await loadIndicator(
        args(client, `http://localhost/indicator/indicator-108${query}`),
      );
      expect(result.compareAreasData).toHaveLength(25);
      expect(result.compareAreaOptions).toHaveLength(25);
      expect(get).toHaveBeenCalledWith(
        '/api/indicators/indicator-108/areas?displayGroup=Local%20authorities',
        expect.anything(),
      );
      const rankings = get.mock.calls.filter(([path]) => path.includes('/108/ranking?'));
      expect(rankings).toHaveLength(1);
      expect(
        new URL(`http://localhost${rankings[0]?.[0]}`).searchParams.getAll('areaCode'),
      ).toHaveLength(25);
      const histories = get.mock.calls.filter(([path]) => path.includes('/108/data?'));
      expect(histories).toHaveLength(1);
    }
  });

  it('loads quintile distributions for picked levels and the current comparison group only when needed', async () => {
    const { client, get } = api();
    await loadIndicator(args(client));
    expect(get.mock.calls.some(([path]) => path.includes('/range?'))).toBe(false);

    get.mockClear();
    await loadIndicator(args(client, 'http://localhost/indicator/indicator-108?quintile-108=yes'));
    expect(
      get.mock.calls.filter(([path]) => path.includes('/range?')).map(([path]) => path),
    ).toEqual(['/api/indicators/108/range?displayGroup=Local%20authorities']);

    get.mockClear();
    await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?quintile-108=yes&as=E06000052'),
    );
    expect(get.mock.calls.filter(([path]) => path.includes('/range?'))).toHaveLength(1);
  });

  it('pairs the full comparison geography group even when the indicator tab has a picked area', async () => {
    const { client, get } = api();
    const read = get.getMockImplementation();
    if (!read) throw new Error('Missing test API implementation');
    get.mockImplementation(async (path) => {
      const result = await read(path);
      if (path.startsWith('/api/indicator-data?')) {
        return (
          result as {
            detail: { shortId: number };
            areaData: { areaCode: string; areaName: string }[];
          }[]
        ).map((entry) => ({
          ...entry,
          areaData: entry.areaData.map((area) => ({
            ...area,
            observations: [observation(entry.detail.shortId === 108 ? 10 : 20)],
          })),
        }));
      }
      if (!path.includes('/data?')) return result;
      return (result as { areaCode: string; areaName: string }[]).map((area) => ({
        ...area,
        observations: [
          {
            fromDate: '2024-01-01',
            toDate: '2024-12-31',
            value: path.includes('/108/') ? 10 : 20,
            count: null,
            numerator: null,
            denominator: null,
            lowerCi95: null,
            upperCi95: null,
            lowerCi998: null,
            upperCi998: null,
            notes: [],
            dimensions: [],
          },
        ],
      }));
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
    expect(get.mock.calls.filter(([path]) => path.includes('/ranking?'))).toHaveLength(0);
    expect(get.mock.calls.filter(([path]) => path.startsWith('/api/indicator-data?'))).toHaveLength(
      2,
    );
    expect(get.mock.calls.filter(([path]) => path === '/api/indicators/241')).toHaveLength(0);
    expect(
      get.mock.calls.filter(
        ([path]) => path === '/api/indicators/indicator-108/areas?displayGroup=Local%20authorities',
      ),
    ).toHaveLength(1);
    expect(result.compareAreasData).toHaveLength(25);
    expect(result.compareAreasData[0]?.observations).toHaveLength(1);
  });

  it('shares recent histories between rankings and scatter when indicators end in different years', async () => {
    const { client, get } = api();
    const read = get.getMockImplementation();
    if (!read) throw new Error('Missing test API implementation');
    const point = (year: number, value: number) => ({
      ...observation(value),
      fromDate: `${year}-01-01`,
      toDate: `${year}-12-31`,
    });
    get.mockImplementation(async (path) => {
      if (path.startsWith('/api/indicator-data?')) {
        const params = new URL(`http://localhost${path}`).searchParams;
        return params.getAll('indicator').map((id) => ({
          detail: { shortId: Number(id) },
          areaData: params.getAll('areaCode').map((code) => ({
            areaCode: code,
            areaName: code,
            observations: id === '108' ? [point(2023, 10), point(2024, 11)] : [point(2023, 20)],
          })),
        }));
      }
      const result = await read(path);
      if (!path.includes('/data?') && !path.includes('/ranking?')) return result;
      return (result as { areaCode: string; areaName: string }[]).map((area) => ({
        ...area,
        observations: path.includes('/108/')
          ? [point(2023, 10), point(2024, 11)]
          : [point(2023, 20)],
      }));
    });
    const result = await loadIndicator(
      args(client, 'http://localhost/indicator/indicator-108?compareWith=indicator-241'),
    );
    expect(result.scatter?.points).toHaveLength(26);
    expect(result.compareAreasData[0]?.observations[0]?.fromDate).toBe('2024-01-01');
    expect(result.comparedAreasData[0]?.observations[0]?.fromDate).toBe('2023-01-01');
    expect(get.mock.calls.some(([path]) => path.includes('/ranking?'))).toBe(false);
    expect(
      result.scatter?.points.every(
        ({ fromDate, x, y }) => fromDate === '2023-01-01' && x === 10 && y === 20,
      ),
    ).toBe(true);
  });
});
