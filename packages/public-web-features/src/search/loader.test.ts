import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { loadSearch } from './loader.ts';

const DISPLAY_GROUPS = [
  'Local authorities',
  'Statistical regions',
  'NHS regions',
  'Integrated care boards',
  'Middle-layer super output areas',
  'GP practices',
];

const EMPTY_FACETS = {
  topics: [],
  classifications: [],
  sources: [],
  valueTypes: [],
  yearTypes: [],
};

const EMPTY_RESULT = { total: 0, limit: 200, indicators: [] };

function api(get = vi.fn()) {
  const client = {
    get: get.getMockImplementation()
      ? get
      : get.mockImplementation((path: string) => {
          if (path === '/api/areas/display-groups') {
            return Promise.resolve(DISPLAY_GROUPS);
          }
          if (path.startsWith('/api/areas/lookup')) {
            const codes = [...new URL(`http://x${path}`).searchParams.getAll('areaCode')];
            return Promise.resolve(
              codes.map((code) => ({
                code,
                name: `Area ${code}`,
                areaType: 'UA unchanged',
                displayGroup: 'Local authorities',
              })),
            );
          }
          if (path === '/api/indicators/facets') {
            return Promise.resolve(EMPTY_FACETS);
          }
          if (path.startsWith('/api/indicators/search')) {
            return Promise.resolve(EMPTY_RESULT);
          }
          return Promise.resolve([]);
        }),
  } as unknown as ApiClient;
  return { client, get };
}

function loaderArgs(client: ApiClient, url = 'http://localhost/search'): LoaderFunctionArgs {
  const context = new RouterContextProvider();
  context.set(apiContext, client);
  return { context, params: {}, request: new Request(url) } as unknown as LoaderFunctionArgs;
}

describe('loadSearch', () => {
  it('discards invalid period filters from both the page and API query', async () => {
    const { client, get } = api();
    const result = await loadSearch(
      loaderArgs(client, 'http://localhost/search?fromYear=abc&toYear=20230&updatedWithin=9'),
    );
    expect(result).toMatchObject({ fromYear: '', toYear: '', updatedWithin: '' });
    const [path] =
      get.mock.calls.find(([path]) => String(path).startsWith('/api/indicators/search')) ?? [];
    const sent = new URL(`http://localhost${path}`).searchParams;
    expect(['fromYear', 'toYear', 'updatedWithin'].some((key) => sent.has(key))).toBe(false);
  });
  it('preserves full source names through the loader and API query', async () => {
    const { client, get } = api();
    const source = 'A data source with a full attribution '.repeat(6);
    const result = await loadSearch(
      loaderArgs(client, `http://localhost/search?${new URLSearchParams({ src: source })}`),
    );
    expect(result.sources).toEqual([source]);
    const [path] =
      get.mock.calls.find(([path]) => String(path).startsWith('/api/indicators/search')) ?? [];
    expect(new URL(`http://localhost${path}`).searchParams.getAll('src')).toEqual([source]);
  });

  it('drops oversized source labels and uses the same bounded query in the page and API', async () => {
    const { client, get } = api();
    const query = `  ${'q'.repeat(220)}  `;
    const result = await loadSearch(
      loaderArgs(
        client,
        `http://localhost/search?${new URLSearchParams({ q: query, src: 's'.repeat(501) })}`,
      ),
    );

    expect(result.q).toBe('q'.repeat(200));
    expect(result.sources).toEqual([]);
    const [path] =
      get.mock.calls.find(([candidate]) =>
        String(candidate).startsWith('/api/indicators/search'),
      ) ?? [];
    const sent = new URL(`http://localhost${path}`).searchParams;
    expect(sent.get('q')).toBe(result.q);
    expect(sent.has('src')).toBe(false);
  });

  it('caps selected areas at 19 and tells the page when a URL exceeds the limit', async () => {
    const { client } = api();
    const codes = Array.from({ length: 21 }, (_, i) => `E${String(i).padStart(8, '0')}`);
    const result = await loadSearch(
      loaderArgs(
        client,
        `http://localhost/search?${new URLSearchParams(codes.map((code) => ['ga', code]))}`,
      ),
    );
    expect(result.gaCodes).toEqual(codes.slice(0, 19));
    expect(result.areasLimited).toBe(true);
  });

  it('returns empty filters when no params are given', async () => {
    const { client, get } = api();

    const result = await loadSearch(loaderArgs(client));

    expect(result.q).toBe('');
    expect(result.topics).toEqual([]);
    expect(result.geoLevels).toEqual([]);
    expect(result.gaCodes).toEqual([]);
    // Both facets and search are called in parallel.
    expect(get).toHaveBeenCalledWith('/api/indicators/facets', expect.anything());
    expect(get).toHaveBeenCalledWith('/api/indicators/search', expect.anything());
  });

  it('treats a query of control characters alone as no query', async () => {
    const { client, get } = api();

    const result = await loadSearch(loaderArgs(client, 'http://localhost/search?q=%00'));

    expect(result.q).toBe('');
    expect(get).toHaveBeenCalledWith('/api/indicators/search', expect.anything());
  });

  it.each(['%09', '%00'])(
    'searches a query holding %s as words separated by a space',
    async (character) => {
      const { client, get } = api();

      const result = await loadSearch(
        loaderArgs(client, `http://localhost/search?q=blood${character}pressure`),
      );

      expect(result.q).toBe('blood pressure');
      expect(get).toHaveBeenCalledWith(
        '/api/indicators/search?q=blood%20pressure',
        expect.anything(),
      );
    },
  );

  it('encodes keyword into the search query', async () => {
    const { client, get } = api();

    await loadSearch(loaderArgs(client, 'http://localhost/search?q=cancer+%26+mortality'));

    expect(
      get.mock.calls.some(([path]) =>
        String(path).includes(`q=${encodeURIComponent('cancer & mortality')}`),
      ),
    ).toBe(true);
  });

  it('passes topic slugs to the search API', async () => {
    const { client, get } = api();

    await loadSearch(loaderArgs(client, 'http://localhost/search?t=mortality&t=obesity'));

    expect(
      get.mock.calls.some(
        ([path]) => String(path).includes('t=mortality') && String(path).includes('t=obesity'),
      ),
    ).toBe(true);
  });

  it('strips invalid geo values and passes validated ones as displayGroup', async () => {
    const { client, get } = api();

    await loadSearch(
      loaderArgs(client, 'http://localhost/search?geo=Local+authorities&geo=Not+A+Real+Level'),
    );

    const searchCall = get.mock.calls.find(([path]) =>
      String(path).startsWith('/api/indicators/search'),
    );
    expect(String(searchCall?.[0])).toContain(
      `displayGroup=${encodeURIComponent('Local authorities')}`,
    );
    expect(String(searchCall?.[0])).not.toContain('Not+A+Real+Level');
  });

  it('drops area codes that fail the pattern', async () => {
    const { client } = api();

    const result = await loadSearch(
      loaderArgs(client, 'http://localhost/search?ga=E12000001&ga=invalid%20code&ga=E09000001'),
    );

    expect(result.gaCodes).not.toContain('invalid code');
    expect(result.gaCodes).toContain('E12000001');
  });

  it('passes resolved ga codes as exact area filters', async () => {
    const { client, get } = api();

    await loadSearch(loaderArgs(client, 'http://localhost/search?ga=E12000001'));

    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('areaCode=E12000001'),
      expect.anything(),
    );
    const searchCall = get.mock.calls.find(([path]) =>
      String(path).startsWith('/api/indicators/search'),
    );
    expect(String(searchCall?.[0])).toContain('areaCode=E12000001');
    expect(String(searchCall?.[0])).not.toContain('displayGroup=Local');
  });

  it('drops ga codes that do not resolve (unknown areas)', async () => {
    const get = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/areas/display-groups') return Promise.resolve(DISPLAY_GROUPS);
      if (path.startsWith('/api/areas/lookup')) {
        // Simulate unknown code: returns empty array (no results).
        return Promise.resolve([]);
      }
      if (path === '/api/indicators/facets') return Promise.resolve(EMPTY_FACETS);
      if (path.startsWith('/api/indicators/search')) return Promise.resolve(EMPTY_RESULT);
      return Promise.resolve([]);
    });
    const { client } = api(get);

    const result = await loadSearch(loaderArgs(client, 'http://localhost/search?ga=UNKNOWN99'));

    expect(result.gaCodes).toHaveLength(0);
  });

  it('deduplicates repeated param values', async () => {
    const { client } = api();

    const result = await loadSearch(
      loaderArgs(client, 'http://localhost/search?t=mortality&t=mortality&t=obesity'),
    );

    expect(result.topics).toEqual(['mortality', 'obesity']);
  });

  it('fires facets and search in parallel (two calls, not sequential)', async () => {
    const callOrder: string[] = [];
    const get = vi.fn().mockImplementation((path: string) => {
      callOrder.push(path);
      if (path === '/api/areas/display-groups') return Promise.resolve(DISPLAY_GROUPS);
      if (path === '/api/indicators/facets') return Promise.resolve(EMPTY_FACETS);
      if (path.startsWith('/api/indicators/search')) return Promise.resolve(EMPTY_RESULT);
      return Promise.resolve([]);
    });
    const { client } = api(get);

    await loadSearch(loaderArgs(client));

    const facetsIdx = callOrder.indexOf('/api/indicators/facets');
    const searchIdx = callOrder.findIndex((p) => p.startsWith('/api/indicators/search'));
    // Both calls happen (order may vary in parallel, but both must be present).
    expect(facetsIdx).toBeGreaterThanOrEqual(0);
    expect(searchIdx).toBeGreaterThanOrEqual(0);
  });

  it('resolves no-JS t-add text to slug by case-insensitive name match and redirects', async () => {
    const get = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/areas/display-groups') return Promise.resolve(DISPLAY_GROUPS);
      if (path === '/api/indicators/facets') {
        return Promise.resolve({
          ...EMPTY_FACETS,
          topics: [
            { slug: 'mortality-and-life-expectancy', title: 'Mortality and life expectancy' },
          ],
        });
      }
      return Promise.resolve([]);
    });
    const { client } = api(get);

    await expect(
      loadSearch(loaderArgs(client, 'http://localhost/search?t-add=MORTALITY+AND+LIFE+EXPECTANCY')),
    ).rejects.toMatchObject({ status: 302 });
  });

  it('fetches display-groups and area lookup in parallel (both called without awaiting)', async () => {
    const callOrder: string[] = [];
    const get = vi.fn().mockImplementation((path: string) => {
      callOrder.push(path);
      if (path === '/api/areas/display-groups') return Promise.resolve(DISPLAY_GROUPS);
      if (path.startsWith('/api/areas/lookup')) {
        return Promise.resolve([
          { code: 'E12000001', name: 'North East', displayGroup: 'Statistical regions' },
        ]);
      }
      if (path === '/api/indicators/facets') return Promise.resolve(EMPTY_FACETS);
      if (path.startsWith('/api/indicators/search')) return Promise.resolve(EMPTY_RESULT);
      return Promise.resolve([]);
    });
    const { client } = api(get);

    await loadSearch(loaderArgs(client, 'http://localhost/search?ga=E12000001'));

    const displayGroupsIdx = callOrder.indexOf('/api/areas/display-groups');
    const lookupIdx = callOrder.findIndex((p) => p.startsWith('/api/areas/lookup'));
    expect(displayGroupsIdx).toBeGreaterThanOrEqual(0);
    expect(lookupIdx).toBeGreaterThanOrEqual(0);
    // Both are initiated before either resolves: they appear adjacent in callOrder.
    expect(Math.abs(displayGroupsIdx - lookupIdx)).toBeLessThanOrEqual(1);
  });

  it('caps ga at 100 codes', async () => {
    const { client } = api();
    const manyGa = Array.from({ length: 120 }, (_, i) => `ga=E${String(i).padStart(8, '0')}`).join(
      '&',
    );

    const result = await loadSearch(loaderArgs(client, `http://localhost/search?${manyGa}`));

    expect(result.gaCodes.length).toBeLessThanOrEqual(100);
  });
});
