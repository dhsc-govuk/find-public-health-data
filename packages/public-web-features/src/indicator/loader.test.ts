import { indicatorAreaDataSchema } from '@fphd/public-api-features/contract';
import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { loadIndicator } from './loader.ts';

function api() {
  const get = vi.fn(async (path: string, schema?: unknown) => {
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
    if (path.includes('/data?')) {
      const data = new URL(`http://localhost${path}`).searchParams
        .getAll('areaCode')
        .map((code) => ({
          areaCode: code,
          areaName: code === 'E92000001' ? 'England' : `Area ${code}`,
          observations: [],
        }));
      return schema === indicatorAreaDataSchema ? data[0] : data;
    }
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
    get.mockImplementation(async (path, schema) => {
      if (path === '/api/indicators/missing') throw new Response(null, { status: 404 });
      return original(path, schema);
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
      get.mockImplementation(async (candidate, schema) => {
        if (candidate === path) throw new Response(null, { status });
        return original(candidate, schema);
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
      get.mock.calls.find(([candidate]) => String(candidate).includes('/108/data?')) ?? [];
    expect(new URL(`http://localhost${path}`).searchParams.getAll('areaCode')).toEqual([
      ...codes.slice(0, 19),
      'E92000001',
    ]);
  });

  it.each([
    ['indicator', '', [1], false, false],
    ['areas', '&compareWith=indicator-241', [1, 20, 5], true, false],
    ['compare', '&compareWith=indicator-241', [1, 20, 5], true, true],
    ['compare', '&find=diabetes', [1], false, false],
    ['inequalities', '&as=E06000052&cmp-108=region&cr-108=yes', [2], false, false],
    ['about', '&compareWith=indicator-241&as=E06000052', [1], false, false],
  ])('loads only the data for %s with %s', async (tab, query, batchSizes, ranking, compared) => {
    const { client, get } = api();
    const result = await loadIndicator(
      args(client, `http://localhost/indicator/indicator-108?tab-indicator=${tab}${query}`),
    );
    const paths = get.mock.calls.map(([path]) => path);
    expect(result.compareAreasData).toHaveLength(ranking ? 25 : 0);
    expect(result.comparedAreasData).toHaveLength(compared ? 25 : 0);
    expect(paths.includes('/api/indicators/indicator-241')).toBe(compared);
    expect(
      paths.some((path) => path.includes('/range?') || path.startsWith('/api/areas/parents')),
    ).toBe(false);
    expect(paths.some((path) => path.startsWith('/api/indicators?q='))).toBe(
      query.includes('find'),
    );
    expect(paths.some((path) => path.includes('/areas?displayGroup='))).toBe(
      ranking || tab === 'indicator',
    );
    expect(
      paths
        .filter((path) => path.includes('/108/data?'))
        .map((path) => new URL(`http://localhost${path}`).searchParams.getAll('areaCode').length),
    ).toEqual(batchSizes);
  });
});
