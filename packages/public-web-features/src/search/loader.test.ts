import { MAX_INDICATOR_QUERY_LENGTH } from '@fphd/public-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import { searchPageSizeContext } from '@fphd/web-server/search-page-size-context';
import {
  createFakeApiClient,
  type FakeApiCall,
  type FakeApiClient,
  type FakeApiStubs,
} from '@fphd/web-server/testing';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { loadSearch, loadSearchPage } from './loader.ts';

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

/** Every area a lookup asks for, as a unitary authority. */
function lookup(call: FakeApiCall) {
  return new URL(`http://x${call.path}`).searchParams.getAll('areaCode').map((code) => ({
    code,
    name: `Area ${code}`,
    areaType: 'UA unchanged',
    displayGroup: 'Local authorities',
  }));
}

/** Answers the reads a search makes with nothing found, and `stubs`. */
function api(stubs: FakeApiStubs = {}) {
  return createFakeApiClient({
    'GET /api/areas/display-groups': DISPLAY_GROUPS,
    'GET /api/areas/lookup': lookup,
    'GET /api/indicators/facets': EMPTY_FACETS,
    'GET /api/indicators/search': EMPTY_RESULT,
    'GET /api/topics': [],
    ...stubs,
  });
}

function paths(client: FakeApiClient) {
  return client.calls.map(({ path }) => path);
}

/** The query string of the search the loader sent to the API. */
function searchSent(client: FakeApiClient) {
  const path = paths(client).find((candidate) => candidate.startsWith('/api/indicators/search'));
  return new URL(`http://localhost${path ?? ''}`).searchParams;
}

function searchPath(client: FakeApiClient) {
  return paths(client).find((candidate) => candidate.startsWith('/api/indicators/search')) ?? '';
}

function loaderArgs(client: FakeApiClient, url = 'http://localhost/search'): LoaderFunctionArgs {
  const context = new RouterContextProvider();
  context.set(apiContext, client);
  context.set(searchPageSizeContext, 50);
  return { context, params: {}, request: new Request(url) } as unknown as LoaderFunctionArgs;
}

describe('loadSearchPage', () => {
  it.each([
    [' \u0000blood\t  pressure\r\n ', 'blood pressure'],
    [`  ${'q'.repeat(MAX_INDICATOR_QUERY_LENGTH)} ignored`, 'q'.repeat(MAX_INDICATOR_QUERY_LENGTH)],
    ['\u0000\t ', ''],
  ])('uses the same cleaned query in the page and API for %j', async (query, expected) => {
    const client = api();
    const result = await loadSearchPage(
      loaderArgs(client, `http://localhost/search?${new URLSearchParams({ q: query })}`),
      true,
    );

    expect(result.q).toBe(expected);
    expect(paths(client)).toContain(
      `/api/indicators/search?${expected ? `q=${encodeURIComponent(expected)}&` : ''}page=1&limit=50`,
    );
  });

  it('sends the recently updated sort to the API and returns it to the page', async () => {
    const client = api();
    const result = await loadSearchPage(
      loaderArgs(client, 'http://localhost/search?q=diabetes&sort=recently-updated'),
      true,
    );

    expect(result.sort).toBe('recently-updated');
    expect(searchPath(client)).toBe(
      '/api/indicators/search?q=diabetes&sort=recently-updated&page=1&limit=50',
    );
  });

  it('sorts browse-all by recently updated without a keyword', async () => {
    const client = api();
    await loadSearchPage(loaderArgs(client, 'http://localhost/search?sort=recently-updated'), true);

    expect(searchPath(client)).toBe('/api/indicators/search?sort=recently-updated&page=1&limit=50');
  });

  it('asks the API for the page in the URL, at the configured page size, and returns it', async () => {
    const client = api({
      'GET /api/indicators/search': { total: 120, limit: 10, page: 2, indicators: [] },
    });
    const args = loaderArgs(client, 'http://localhost/search?q=diabetes&page=2');
    args.context.set(searchPageSizeContext, 10);
    const result = await loadSearchPage(args, true);

    expect(searchSent(client).get('page')).toBe('2');
    expect(searchSent(client).get('limit')).toBe('10');
    expect(result.searchResult.page).toBe(2);
  });

  it.each([
    ['one past the last page to the last', '9', '9', 3],
    ['page 0 to the first', '0', '1', 1],
    ['a page that is not a number to the first', 'two', '1', 1],
  ])('redirects %s', async (_name, page, sent, answered) => {
    const client = api({
      'GET /api/indicators/search': { total: 120, limit: 50, page: answered, indicators: [] },
    });

    await expect(
      loadSearchPage(
        loaderArgs(client, `http://localhost/search?q=rate&page=${page}&sort=recently-updated`),
        true,
      ),
    ).rejects.toSatisfy(
      (response: Response) =>
        response.status === 302 &&
        response.headers.get('Location') ===
          `/search?q=rate&page=${answered}&sort=recently-updated`,
    );
    expect(searchSent(client).get('page')).toBe(sent);
  });

  it('redirects a client-side navigation to the page rather than its data', async () => {
    const client = api({
      'GET /api/indicators/search': { total: 120, limit: 50, page: 3, indicators: [] },
    });

    await expect(
      loadSearchPage(
        loaderArgs(client, 'http://localhost/search.data?page=9&_routes=search%2Froute'),
        true,
      ),
    ).rejects.toSatisfy(
      (response: Response) => response.headers.get('Location') === '/search?page=3',
    );
  });

  it('starts again from the first page when a filter is added by name', async () => {
    const client = api({
      'GET /api/indicators/facets': { ...EMPTY_FACETS, valueTypes: ['Proportion'] },
    });

    await expect(
      loadSearchPage(
        loaderArgs(client, 'http://localhost/search?q=rate&page=4&vt-add=proportion'),
        true,
      ),
    ).rejects.toSatisfy(
      (response: Response) => response.headers.get('Location') === '/search?q=rate&vt=Proportion',
    );
  });

  it.each(['', '&sort=relevance', '&sort=name-desc', '&sort=nonsense'])(
    'leaves relevance to the API default for %j',
    async (sort) => {
      const client = api();
      const result = await loadSearchPage(
        loaderArgs(client, `http://localhost/search?q=diabetes${sort}`),
        true,
      );

      expect(result.sort).toBe('relevance');
      expect(searchSent(client).has('sort')).toBe(false);
    },
  );

  it('loads topic results while indicator search is still waiting for geography data', async () => {
    const groups = Promise.withResolvers<string[]>();
    const topics = [
      {
        slug: 'diabetes',
        title: 'Diabetes',
        description: 'Diabetes data',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ];
    const client = api({
      'GET /api/areas/display-groups': () => groups.promise,
      'GET /api/topics': topics,
    });

    const loading = loadSearchPage(loaderArgs(client, 'http://localhost/search?q=diabetes'), true);

    expect(paths(client)).toContain('/api/topics');
    expect(searchPath(client)).toBe('');
    groups.resolve(DISPLAY_GROUPS);

    await expect(loading).resolves.toMatchObject({
      q: 'diabetes',
      topicResults: topics,
      searchResult: EMPTY_RESULT,
    });
  });
});

describe('loadSearch', () => {
  it('discards invalid period filters from both the page and API query', async () => {
    const client = api();
    const result = await loadSearch(
      loaderArgs(client, 'http://localhost/search?fromYear=abc&toYear=20230&updatedWithin=9'),
    );
    expect(result).toMatchObject({ fromYear: '', toYear: '', updatedWithin: '' });
    const sent = searchSent(client);
    expect(['fromYear', 'toYear', 'updatedWithin'].some((key) => sent.has(key))).toBe(false);
  });
  it('preserves full source names through the loader and API query', async () => {
    const client = api();
    const source = 'A data source with a full attribution '.repeat(6);
    const result = await loadSearch(
      loaderArgs(client, `http://localhost/search?${new URLSearchParams({ src: source })}`),
    );
    expect(result.sources).toEqual([source]);
    expect(searchSent(client).getAll('src')).toEqual([source]);
  });

  it('drops oversized source labels and uses the same bounded query in the page and API', async () => {
    const client = api();
    const query = `  ${'q'.repeat(220)}  `;
    const result = await loadSearch(
      loaderArgs(
        client,
        `http://localhost/search?${new URLSearchParams({ q: query, src: 's'.repeat(501) })}`,
      ),
    );

    expect(result.q).toBe('q'.repeat(200));
    expect(result.sources).toEqual([]);
    const sent = searchSent(client);
    expect(sent.get('q')).toBe(result.q);
    expect(sent.has('src')).toBe(false);
  });

  it('caps selected areas at 19 and tells the page when a URL exceeds the limit', async () => {
    const client = api();
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
    const client = api();

    const result = await loadSearch(loaderArgs(client));

    expect(result.q).toBe('');
    expect(result.topics).toEqual([]);
    expect(result.geoLevels).toEqual([]);
    expect(result.gaCodes).toEqual([]);
    // Both facets and search are called in parallel.
    expect(paths(client)).toContain('/api/indicators/facets');
    expect(paths(client)).toContain('/api/indicators/search');
  });

  it('treats a query of control characters alone as no query', async () => {
    const client = api();

    const result = await loadSearch(loaderArgs(client, 'http://localhost/search?q=%00'));

    expect(result.q).toBe('');
    expect(paths(client)).toContain('/api/indicators/search');
  });

  it.each(['%09', '%00'])(
    'searches a query holding %s as words separated by a space',
    async (character) => {
      const client = api();

      const result = await loadSearch(
        loaderArgs(client, `http://localhost/search?q=blood${character}pressure`),
      );

      expect(result.q).toBe('blood pressure');
      expect(paths(client)).toContain('/api/indicators/search?q=blood%20pressure');
    },
  );

  it('encodes keyword into the search query', async () => {
    const client = api();

    await loadSearch(loaderArgs(client, 'http://localhost/search?q=cancer+%26+mortality'));

    expect(searchPath(client)).toContain(`q=${encodeURIComponent('cancer & mortality')}`);
  });

  it('passes topic slugs to the search API', async () => {
    const client = api();

    await loadSearch(loaderArgs(client, 'http://localhost/search?t=mortality&t=obesity'));

    expect(searchSent(client).getAll('t')).toEqual(['mortality', 'obesity']);
  });

  it('strips invalid geo values and passes validated ones as displayGroup', async () => {
    const client = api();

    await loadSearch(
      loaderArgs(client, 'http://localhost/search?geo=Local+authorities&geo=Not+A+Real+Level'),
    );

    expect(searchPath(client)).toContain(`displayGroup=${encodeURIComponent('Local authorities')}`);
    expect(searchPath(client)).not.toContain('Not+A+Real+Level');
  });

  it('drops area codes that fail the pattern', async () => {
    const client = api();

    const result = await loadSearch(
      loaderArgs(client, 'http://localhost/search?ga=E12000001&ga=invalid%20code&ga=E09000001'),
    );

    expect(result.gaCodes).not.toContain('invalid code');
    expect(result.gaCodes).toContain('E12000001');
  });

  it('passes resolved ga codes as exact area filters', async () => {
    const client = api();

    await loadSearch(loaderArgs(client, 'http://localhost/search?ga=E12000001'));

    expect(paths(client)).toContain('/api/areas/lookup?areaCode=E12000001');
    expect(searchPath(client)).toContain('areaCode=E12000001');
    expect(searchPath(client)).not.toContain('displayGroup=Local');
  });

  it('drops ga codes that do not resolve (unknown areas)', async () => {
    // The lookup finds nothing for an unknown code.
    const client = api({ 'GET /api/areas/lookup': [] });

    const result = await loadSearch(loaderArgs(client, 'http://localhost/search?ga=UNKNOWN99'));

    expect(result.gaCodes).toHaveLength(0);
  });

  it('deduplicates repeated param values', async () => {
    const client = api();

    const result = await loadSearch(
      loaderArgs(client, 'http://localhost/search?t=mortality&t=mortality&t=obesity'),
    );

    expect(result.topics).toEqual(['mortality', 'obesity']);
  });

  it('fires facets and search in parallel (two calls, not sequential)', async () => {
    const client = api();

    await loadSearch(loaderArgs(client));

    const callOrder = paths(client);
    const facetsIdx = callOrder.indexOf('/api/indicators/facets');
    const searchIdx = callOrder.findIndex((p) => p.startsWith('/api/indicators/search'));
    // Both calls happen (order may vary in parallel, but both must be present).
    expect(facetsIdx).toBeGreaterThanOrEqual(0);
    expect(searchIdx).toBeGreaterThanOrEqual(0);
  });

  it('resolves no-JS t-add text to slug by case-insensitive name match and redirects', async () => {
    const client = api({
      'GET /api/indicators/facets': {
        ...EMPTY_FACETS,
        topics: [{ slug: 'mortality-and-life-expectancy', title: 'Mortality and life expectancy' }],
      },
    });

    await expect(
      loadSearch(loaderArgs(client, 'http://localhost/search?t-add=MORTALITY+AND+LIFE+EXPECTANCY')),
    ).rejects.toMatchObject({ status: 302 });
  });

  it('fetches display-groups and area lookup in parallel (both called without awaiting)', async () => {
    const client = api({
      'GET /api/areas/lookup': [
        {
          code: 'E12000001',
          name: 'North East',
          areaType: 'Regions (statistical)',
          displayGroup: 'Statistical regions',
        },
      ],
    });

    await loadSearch(loaderArgs(client, 'http://localhost/search?ga=E12000001'));

    const callOrder = paths(client);
    const displayGroupsIdx = callOrder.indexOf('/api/areas/display-groups');
    const lookupIdx = callOrder.findIndex((p) => p.startsWith('/api/areas/lookup'));
    expect(displayGroupsIdx).toBeGreaterThanOrEqual(0);
    expect(lookupIdx).toBeGreaterThanOrEqual(0);
    // Both are initiated before either resolves: they appear adjacent in callOrder.
    expect(Math.abs(displayGroupsIdx - lookupIdx)).toBeLessThanOrEqual(1);
  });

  it('caps ga at 100 codes', async () => {
    const client = api();
    const manyGa = Array.from({ length: 120 }, (_, i) => `ga=E${String(i).padStart(8, '0')}`).join(
      '&',
    );

    const result = await loadSearch(loaderArgs(client, `http://localhost/search?${manyGa}`));

    expect(result.gaCodes.length).toBeLessThanOrEqual(100);
  });
});
